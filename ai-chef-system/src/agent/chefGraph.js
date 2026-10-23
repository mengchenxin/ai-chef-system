// src/agent/chefGraph.js
// 图结构：router 先判意图，再分发到三个子节点
//   nutrition —— 带工具，可能走 tools 节点查完再回来（ReAct 循环）
//   recipe    —— 不要工具，要求输出可执行的步骤
//   chat      —— 不要工具，短答
// 三个子节点用的都是同一条会话上下文（system 里含画像和摘要），只是任务约束不同。
import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { nutritionTool } from "./tools.js";
import { rawLlm, llmFast } from "./llm.js";
import { ruleClassify } from "./intentRules.js";
import 'dotenv/config';

// 1. 状态：messages 之外多一个 intent，由 router 节点写
const AgentState = Annotation.Root({
  messages: Annotation({ reducer: messagesStateReducer }),
  intent: Annotation({ reducer: (_prev, next) => next, default: () => "chat" }),
});

// 营养查询要吃工具，绑一个带工具的实例（bindTools 返回新实例，不影响 rawLlm）
const toolLlm = rawLlm.bindTools([nutritionTool]);

// 2. 意图识别：先用规则挡掉大多数（见 intentRules.js），规则兜不住才花一次模型调用
export async function classifyIntent(text) {
  const byRule = ruleClassify(text);
  if (byRule) return { intent: byRule, by: "rule" };

  try {
    // 分类只需要一个单词，用零温度 + 限长的实例，别拿生成实例去烧 token
    const res = await llmFast.invoke([
      {
        role: "system",
        content: "把用户这句话归类为 nutrition（查营养成分）/ recipe（要具体做法）/ chat（其他），只输出一个英文单词。",
      },
      { role: "user", content: text },
    ]);
    const got = String(res.content).toLowerCase();
    if (got.includes("nutrition")) return { intent: "nutrition", by: "llm" };
    if (got.includes("recipe")) return { intent: "recipe", by: "llm" };
    return { intent: "chat", by: "llm" };
  } catch (e) {
    console.warn("[Router] 意图分类失败，按闲聊处理：", e.message);
    return { intent: "chat", by: "fallback" };
  }
}

// 在已有 system prompt（含画像、摘要）后面追加本次任务的约束
function withExtraSystem(messages, extra) {
  const system = messages.find(m => m.role === "system");
  return [
    { role: "system", content: `${system?.content || ""}\n\n【本次任务要求】${extra}` },
    ...messages.filter(m => m.role !== "system"),
  ];
}

// 3. 节点定义
const routerNode = async (state) => {
  const lastUser = [...state.messages].reverse().find(m => m.role === "user");
  const { intent, by } = await classifyIntent(lastUser?.content || "");
  console.log(`[Router] 意图 = ${intent}（判定方式：${by}）`);
  return { intent };
};

// 营养查询：绑了工具，模型想调就调，调完再回这个节点继续
const nutritionNode = async (state) => {
  const res = await toolLlm.invoke(state.messages);
  return { messages: [res] };
};

// 菜谱：不需要工具，但要求输出能照着做的步骤
const recipeNode = async (state) => {
  const res = await rawLlm.invoke(withExtraSystem(
    state.messages,
    "用户要的是具体做法。按【用料】【步骤】【火候与易错点】分段，步骤编号，直接给内容不要寒暄。"
  ));
  return { messages: [res] };
};

// 闲聊：简短一点，别写成长文
const chatNode = async (state) => {
  const res = await rawLlm.invoke(withExtraSystem(
    state.messages,
    "这次是闲聊或泛泛的饮食建议。口语化，控制在 120 字以内。"
  ));
  return { messages: [res] };
};

// 4. ReAct 的判断：模型这一轮要调工具就去 tools，不要就结束
const shouldContinue = (state) => {
  const lastMessage = state.messages[state.messages.length - 1];
  if (lastMessage.tool_calls?.length) return "tools";
  return "__end__";
};

// 5. 编排
const workflow = new StateGraph(AgentState)
  .addNode("router", routerNode)
  .addNode("nutrition", nutritionNode)
  .addNode("recipe", recipeNode)
  .addNode("chat", chatNode)
  .addNode("tools", new ToolNode([nutritionTool]))
  .addEdge("__start__", "router")
  .addConditionalEdges("router", (state) => state.intent, {
    nutrition: "nutrition",
    recipe: "recipe",
    chat: "chat",
  })
  .addConditionalEdges("nutrition", shouldContinue)
  .addEdge("tools", "nutrition")   // 工具执行完回到营养节点继续推理
  .addEdge("recipe", "__end__")
  .addEdge("chat", "__end__");

export const chefAgent = workflow.compile();
