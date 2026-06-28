// src/agent/chefGraph.js (完整版逻辑)
import { StateGraph, Annotation, messagesStateReducer } from "@langchain/langgraph";
import { ToolNode } from "@langchain/langgraph/prebuilt";
import { ChatOpenAI } from "@langchain/openai";
import { nutritionTool } from "./tools.js"; // 你刚才写的工具
import 'dotenv/config'; // 这行代码会强制加载项目根目录下的 .env 文件
import { HttpsProxyAgent } from "https-proxy-agent";

// 1. 定义状态 (Messages 必须是状态的一部分，这是 ReAct 的基础)
const AgentState = Annotation.Root({
  messages: Annotation({ reducer: messagesStateReducer }),
});

// 如果你本地运行了科学上网工具，通常端口是 7890
const proxyAgent = new HttpsProxyAgent("http://127.0.0.1:7890");

// 2. 初始化带有工具绑定的模型
const llm = new ChatOpenAI({ 
  model: "deepseek-chat", // 或者是 "deepseek-coder"，取决于你用的模型
  apiKey: process.env.OPENAI_API_KEY, // 虽然名字叫 OPENAI_API_KEY，但里面存的是 DeepSeek 的 Key
  configuration: {
    baseURL: "https://api.deepseek.com/v1", // 关键：指向 DeepSeek 接口地址
  }
}).bindTools([nutritionTool]);

// 3. 定义 ChefAgent 节点 (思考节点)
const chefAgentNode = async (state) => {
  const response = await llm.invoke(state.messages);
  return { messages: [response] };
};

// 4. 定义路由逻辑 (决定是继续生成，还是去调用工具，还是结束)
const shouldContinue = (state) => {
  const { messages } = state;
  const lastMessage = messages[messages.length - 1];
  // 如果模型想调用工具，返回 "tools"，否则结束
  if (lastMessage.tool_calls?.length) return "tools";
  return "__end__";
};

// 5. 编排图逻辑
const workflow = new StateGraph(AgentState)
  .addNode("agent", chefAgentNode)
  .addNode("tools", new ToolNode([nutritionTool])) // 自动执行工具
  .addEdge("__start__", "agent")
  .addConditionalEdges("agent", shouldContinue)   // 路由判断
  .addEdge("tools", "agent");                    // 工具执行完回到 Agent 继续思考

export const chefAgent = workflow.compile();

// --- 本地测试代码 ---
// async function testAgent() {
//   console.log("🚀 开始测试 ChefAgent...");
//   // 模拟用户询问一个需要调用工具的问题
//   const inputs = { 
//     messages: [{ role: "user", content: "帮我查询一下三文鱼的营养价值" }] 
//   };
  
//   // 运行图并打印每一步的结果
//   const stream = await chefAgent.stream(inputs);
//   for await (const event of stream) {
//     console.log("-------------------");
//     console.log(event);
//   }
// }

// // 执行测试 (确保你安装了 ts-node 或者用 node 运行)
// // 如果直接用 node 运行，记得确保你的 package.json 设置了 "type": "module"
// testAgent().catch(console.error);