// src/index.js (持久化升级版)
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chefAgent } from './agent/chefGraph.js';
import AgentLog from './models/AgentLog.js'; // 导入刚写的日志模型

const app = express();
app.use(cors());
app.use(express.json());

app.post('/api/chef/cook/stream', async (req, res) => {
  console.log("🔥 后端收到请求了！请求内容:", req.body);
  const { prompt } = req.body;
  if (!prompt) return res.status(400).json({ error: "请提供需求" });

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 1. 初始化轨迹收集器和最终文本变量
  const traceCollector = [];
  let finalResponseText = "";

  try {
    const stream = await chefAgent.stream({ 
      messages: [{ role: "user", content: prompt }] 
    });

    for await (const chunk of stream) {
      const nodeName = Object.keys(chunk)[0];
      const nodeState = chunk[nodeName];

      if (nodeState && nodeState.messages) {
        const lastMsg = nodeState.messages[nodeState.messages.length - 1];
        
        // 2. 录制轨迹：记录当前节点和消息快照
        traceCollector.push({
          node: nodeName,
          timestamp: new Date().toISOString(),
          messageType: lastMsg.constructor.name,
          content: lastMsg.content,
          tool_calls: lastMsg.tool_calls || null
        });

        // 3. 业务流式推送逻辑
        if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
           res.write(`data: ${JSON.stringify({ text: "\n*(大厨正在翻阅食材数据库...)*\n\n" })}\n\n`);
        } else if (lastMsg.content) {
           finalResponseText += lastMsg.content; // 累加最终文本用于存库
           res.write(`data: ${JSON.stringify({ text: lastMsg.content })}\n\n`);
        }
      }
    }

    // 4. 当流成功结束，异步将完整轨迹写入 MySQL
    // 使用异步不阻塞前端响应
    AgentLog.create({
      userPrompt: prompt,
      executionTrace: traceCollector, // Sequelize 会自动将其序列化为 JSON 字符串入库
      finalResponse: finalResponseText
    }).then(() => {
      console.log("💾 [MySQL] Agent 推理轨迹已成功持久化归档。");
    }).catch(err => {
      console.error("❌ [MySQL] 日志写入失败:", err);
    });

  } catch (error) {
    console.error("Agent 执行出错:", error);
    res.write(`data: ${JSON.stringify({ text: "\n生成失败，请检查网络或后端服务。\n" })}\n\n`);
  } finally {
    res.end();
  }
});

const PORT = process.env.PORT || 3000;

import sequelize from './config/database.js'; // 引入刚写好的连接

// 先同步数据库建表，再启动 Web 服务
sequelize.sync({ alter: true }) // alter: true 会自动根据模型调整表结构，不删数据
  .then(() => {
    console.log('💾 [MySQL] 数据库连接成功，表结构同步完成。');
    app.listen(PORT, () => {
      console.log(`\n🍳 AI 私厨流式后端已启动！`);
      console.log(`🔗 核心流式接口: http://localhost:${PORT}/api/chef/cook/stream\n`);
    });
  })
  .catch(err => {
    console.error('❌ [MySQL] 数据库连接或建表失败:', err);
  });