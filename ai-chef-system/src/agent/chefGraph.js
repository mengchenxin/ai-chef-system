import { z } from "zod";
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, START, END, Annotation } from "@langchain/langgraph";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

// 1. 约束 AI 输出：定义前端能够直接渲染的完美菜谱结构
const recipeSchema = z.object({
  recipeName: z.string().describe("菜品名称，例如：低脂黑椒西蓝花炒鸡胸肉"),
  cookingTime: z.string().describe("预计烹饪耗时，例如：15分钟"),
  difficulty: z.enum(["简单", "中等", "困难"]).describe("烹饪难度"),
  ingredients: z.array(z.object({
    name: z.string().describe("食材或调料名称"),
    amount: z.string().describe("精确用量，如：200g、1茶匙")
  })).describe("用料配比清单"),
  steps: z.array(z.string()).describe("详细的闭环烹饪步骤说明"),
  nutritionTips: z.string().describe("针对该菜品的营养学建议与卡路里估算")
});

// 初始化大模型（以 DeepSeek 为例）
const llm = new ChatOpenAI({ 
  modelName: "deepseek-chat", // 换成你实际使用的模型名称
  temperature: 0.2,
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: "https://api.deepseek.com/v1" // 填入对应的官方或中转接口地址
  },
  timeout: 60000, // 关键：将超时时间延长到 60 秒（生成复杂 JSON 菜谱比较耗时）
  maxRetries: 2   // 失败时自动重试 2 次
});

// 2. 定义智能体图的状态上下文
export const ChefGraphState = Annotation.Root({
  messages: Annotation({ reducer: (x, y) => x.concat(y), default: () => [] }),
  nextAgent: Annotation({ reducer: (x, y) => y, default: () => "supervisor" }),
  recipeContext: Annotation({ reducer: (x, y) => y, default: () => "" })
});

// 3. Supervisor 节点：进行意图识别与路由分发
async function supervisorNode(state) {
  const lastMsg = state.messages[state.messages.length - 1].content;
  console.log("[AI私厨管家] 正在分析用户的饮食意图...");

  // 检查是否包含健康、减脂、生病等特殊饮食限制
  const needsNutritionPlan = ["减脂", "健身", "控糖", "低卡", "高血压", "糖尿病", "减重"].some(k => lastMsg.includes(k));

  if (needsNutritionPlan) {
    console.log("[AI私厨管家] 识别到特殊膳食/减脂需求，路由至 -> 营养知识库Agent");
    return { nextAgent: "nutrition_agent" };
  } else {
    console.log("[AI私厨管家] 识别为常规家常菜定制，路由至 -> 首席大厨Agent");
    return { nextAgent: "recipe_agent" };
  }
}

// 4. Nutrition Agent 节点：模拟 RAG 知识注入
async function nutritionNode(state) {
  const lastMsg = state.messages[state.messages.length - 1].content;
  console.log(`[营养库检索] 正在检索与 "${lastMsg}" 相关的专业膳食指导标准...`);
  
  // 模拟从向量数据库（VectorDB）检索出的黑马专属健康配餐原则
  const mockRAGData = "【黑马私厨营养库指引】：减脂控糖餐中，严格限制精制油与添加糖的摄入。必须使用低硝盐，烹饪方式推荐水煮或橄榄油轻煎，单餐控盐在2g以内，控油在5g以内。";
  
  return { 
    recipeContext: mockRAGData,
    nextAgent: "recipe_agent" // 检索到专业知识后，带上知识去下一站
  };
}
// 5. Recipe Agent 节点：主厨智能体（适配 DeepSeek 兼容版）
async function recipeNode(state) {
  console.log("[首席大厨] 接收到需求与上下文，正在为您定制精准度量衡菜谱...");
  const { messages, recipeContext } = state;
  
  // 核心改动 1：把原本用 Zod 写的格式要求，直接写进系统提示词里
  let systemPrompt = `你是一名精通中华八大菜系、同时具备现代膳食营养学证书的顶级 AI 私厨。请根据用户提供的现有食材或口味期望，生成一份极其标准、具备实操性的量化菜谱。

【绝对强制要求】请你务必且只能输出合法的 JSON 格式数据，千万不要输出任何 Markdown 标记（如 \`\`\`json）或多余的解释性文本。JSON 的数据结构必须严格如下：
{
  "recipeName": "菜品名称（例如：黑椒西蓝花炒鸡胸肉）",
  "cookingTime": "预计烹饪耗时（例如：15分钟）",
  "difficulty": "简单/中等/困难",
  "ingredients": [
    {"name": "食材名称", "amount": "精确用量"}
  ],
  "steps": ["步骤1", "步骤2", "步骤3"],
  "nutritionTips": "针对该菜品的营养学建议与卡路里估算"
}`;
  
  if (recipeContext) {
    systemPrompt += `\n\n【重要指引】请在设计这道菜谱时，严格遵守以下膳食与烹饪指引：\n${recipeContext}`;
  }

  const promptMessages = [
    new SystemMessage(systemPrompt),
    ...messages
  ];


// 核心改动 2：直接在 invoke 触发时，告诉 DeepSeek 必须返回 JSON 对象
  const response = await llm.invoke(promptMessages, {
    response_format: { type: "json_object" }
  });
  
  // 核心改动 3：为了防止大模型偶尔犯病加上 markdown 符号，我们做一层字符串清理兜底
  let cleanJsonString = response.content.trim();
  if (cleanJsonString.startsWith("```json")) {
    cleanJsonString = cleanJsonString.replace(/^```json/, "").replace(/```$/, "").trim();
  }

  // 将清理干净的 JSON 字符串传给最终状态
  return { 
    messages: [new SystemMessage(cleanJsonString)],
    nextAgent: END
  };
}
// 6. 编排并编译状态图
const workflow = new StateGraph(ChefGraphState)
  .addNode("supervisor", supervisorNode)
  .addNode("nutrition_agent", nutritionNode)
  .addNode("recipe_agent", recipeNode)
  .addEdge(START, "supervisor")
  .addConditionalEdges("supervisor", (state) => state.nextAgent, {
    nutrition_agent: "nutrition_agent",
    recipe_agent: "recipe_agent"
  })
  .addEdge("nutrition_agent", "recipe_agent")
  .addEdge("recipe_agent", END);

export const chefAgentApp = workflow.compile();