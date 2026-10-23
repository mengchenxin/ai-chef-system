// src/agent/llm.js
// 两个模型实例：
//   rawLlm  —— 带温度的对话实例，用于生成菜谱/闲聊正文
//   llmFast —— 温度 0 + 限制输出长度，用于意图分类、摘要、画像抽取这类轻任务
// 分开的原因有两个：bindTools 之后模型倾向走工具路径，做纯文本判断反而不稳；
// 轻任务的输出很短，不限制 maxTokens 会白烧 token（分类只需要一个单词）。
import { ChatOpenAI } from "@langchain/openai";
import 'dotenv/config';

if (!process.env.OPENAI_API_KEY) {
  throw new Error('缺少 OPENAI_API_KEY（存 DeepSeek 的 key 也用这个变量名），请检查 .env');
}

const baseConfig = {
  model: process.env.LLM_MODEL || "deepseek-chat",
  apiKey: process.env.OPENAI_API_KEY,
  configuration: {
    baseURL: process.env.LLM_BASE_URL || "https://api.deepseek.com/v1",
  },
};

// 生成用：要文采、要自然
export const rawLlm = new ChatOpenAI({
  ...baseConfig,
  temperature: 0.7,
  timeout: 60000,
});

// 判定用：要确定性、要短
export const llmFast = new ChatOpenAI({
  ...baseConfig,
  temperature: 0,
  maxTokens: 400,
  timeout: 30000,
});
