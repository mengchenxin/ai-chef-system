import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { HumanMessage } from "@langchain/core/messages";
import { chefAgentApp } from './agent/chefGraph.js';
import Recipe, { sequelize } from './models/Recipe.js';

const app = express();
app.use(cors());
app.use(express.json());

// 确认只有 Sequelize 的同步逻辑
sequelize.sync({ alter: true })
  .then(() => console.log('✅ MySQL 数据库已连接并同步表结构'))
  .catch(err => console.error('❌ MySQL 连接失败:', err));

// 2. 连接 MongoDB 数据库 (默认连接本地的 ai_chef 数据库)
const MONGO_URI = process.env.MONGO_URI;
app.get('/health', (req, res) => res.send('AI 私厨后端服务正常运行中！'));

app.post('/api/chef/cook/stream', async (req, res) => {
  const { prompt } = req.body;

  if (!prompt) return res.status(400).json({ error: "请提供您的需求" });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const initialState = { messages: [new HumanMessage(prompt)], recipeContext: "" };
    const stream = await chefAgentApp.streamEvents(initialState, { version: "v2" });

    // ✨ 核心技巧：准备一个空字符串，用来收集大模型的碎片
    let fullJsonString = "";

    for await (const event of stream) {
      if (event.event === "on_chat_model_stream") {
        const token = event.data.chunk.content;
        if (token) {
          fullJsonString += token; // 把每个字都收集起来
          res.write(`data: ${JSON.stringify({ text: token })}\n\n`); // 同时实时发给前端
        }
      }
    }

    // 3. 流式输出结束了，前端已经看到了完整文字。我们现在后台偷偷存数据库
    try {
      // 把拼凑完整的 JSON 字符串转回 JS 对象
      const recipeData = JSON.parse(fullJsonString); 
      
      // 实例化一条新的数据库记录
      const newRecipe = new Recipe({
        prompt: prompt,
        ...recipeData // 把菜名、食材、步骤全部解构塞进去
      });
      
      await newRecipe.save(); // 保存到 MongoDB
      console.log(`✅ 菜谱入库成功: ${recipeData.recipeName}`);
    } catch (dbErr) {
      console.error("❌ 菜谱解析或入库失败:", dbErr.message);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (error) {
    console.error("流式输出发生中断:", error);
    res.write(`data: ${JSON.stringify({ error: "大模型连接中断" })}\n\n`);
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🍳 AI 私厨流式后端已启动！`);
  console.log(`🔗 核心流式接口: http://localhost:${PORT}/api/chef/cook/stream\n`);
});