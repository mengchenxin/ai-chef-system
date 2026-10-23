// src/index.js
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { chefAgent } from './agent/chefGraph.js';
import AgentLog from './models/AgentLog.js';
import sequelize from './config/database.js';
import {
  loadSession,
  prepareMessages,
  appendTurn,
  maybeRefreshProfile,
} from './agent/memory.js';

const app = express();
app.use(cors());
app.use(express.json());

// 单轮最多允许几次节点跳转，防止工具调用来回打转把 token 烧光
const RECURSION_LIMIT = Number(process.env.AGENT_RECURSION_LIMIT) || 10;

app.get('/health', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});

app.post('/api/chef/cook/stream', async (req, res) => {
  const { prompt, sessionId } = req.body;

  // sessionId 决定这段对话和谁共享记忆，必须由前端给。
  // 之前默认成 'default'，所有没传的请求都会落进同一个会话，多个人测就串台了。
  if (!sessionId) {
    return res.status(400).json({ error: '缺少 sessionId，前端应在 localStorage 里生成一个并随请求带上' });
  }
  if (!prompt || !String(prompt).trim()) {
    return res.status(400).json({ error: '请提供需求' });
  }

  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const traceCollector = [];
  let finalResponseText = '';
  // 用户关掉页面后继续跑推理纯属浪费，标记一下，循环里就能提前退出
  let clientGone = false;
  res.on('close', () => { clientGone = true; });

  const send = (payload) => {
    if (clientGone || res.writableEnded) return;
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    // ---- 记忆层：读会话 → 超窗口就压缩 → 拼出这次要发的消息 ----
    const session = await loadSession(sessionId);
    const { messages, windowSize, summary, profile } = await prepareMessages(session, prompt);

    console.log(
      `[Memory] 会话 ${sessionId}｜窗口内 ${windowSize} 条｜摘要 ${summary.length} 字｜` +
      `画像字段 ${Object.keys(profile || {}).length} 个｜累计 ${session.turnCount || 0} 轮`
    );

    // ---- 推理层：跑图，逐节点往下游推 ----
    const stream = await chefAgent.stream(
      { messages },
      { recursionLimit: RECURSION_LIMIT }
    );

    for await (const chunk of stream) {
      if (clientGone) {
        console.log('[SSE] 客户端已断开，停止推流');
        break;
      }

      const nodeName = Object.keys(chunk)[0];
      const nodeState = chunk[nodeName];

      // 路由结果单独推给前端，前端能显示"识别为菜谱/营养/闲聊"
      if (nodeName === 'router' && nodeState?.intent) {
        traceCollector.push({
          node: 'router',
          timestamp: new Date().toISOString(),
          intent: nodeState.intent,
        });
        send({ intent: nodeState.intent });
        continue;
      }

      if (nodeState && nodeState.messages) {
        const lastMsg = nodeState.messages[nodeState.messages.length - 1];

        traceCollector.push({
          node: nodeName,
          timestamp: new Date().toISOString(),
          messageType: lastMsg.constructor.name,
          content: lastMsg.content,
          tool_calls: lastMsg.tool_calls || null,
        });

        // 工具节点的输出是 ToolMessage，它的 content 是喂给模型的原始数据。
        // 如果当正文推出去，用户会先看到一遍原始数据、再看到模型复述一遍。
        // 只让它进轨迹，不回显。
        const msgType = lastMsg.type || lastMsg._getType?.() || lastMsg.constructor.name;
        if (msgType === 'tool' || msgType === 'ToolMessage') {
          continue;
        }

        if (lastMsg.tool_calls && lastMsg.tool_calls.length > 0) {
          // 用 tool 事件而不是文本事件：混进正文会被当成回答内容存进历史
          send({ status: 'tool_running', tool: lastMsg.tool_calls[0]?.name });
        } else if (lastMsg.content) {
          finalResponseText += lastMsg.content;
          send({ text: lastMsg.content });
        }
      }
    }

    // ---- 记忆层：把这一轮写回会话，再视轮数决定要不要刷新画像 ----
    await appendTurn(session, prompt, finalResponseText);
    // 画像抽取是附带动作，失败不该影响这次回答，所以不 await
    maybeRefreshProfile(session).catch(err =>
      console.warn('[Memory] 画像刷新异常：', err.message)
    );

    // ---- 可观测层：整条推理轨迹异步落库 ----
    AgentLog.create({
      userPrompt: prompt,
      executionTrace: traceCollector,
      finalResponse: finalResponseText,
    }).then(() => {
      console.log('💾 [MySQL] Agent 推理轨迹已成功持久化归档。');
    }).catch(err => {
      console.error('❌ [MySQL] 日志写入失败:', err);
    });

  } catch (error) {
    console.error('Agent 执行出错:', error);
    send({ text: '\n生成失败，请检查网络或后端服务。\n' });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

const PORT = process.env.PORT || 3000;

// alter 会把库里已有表结构改成和模型一致，生产环境是危险操作，
// 所以默认关掉，需要加字段时手动跑：DB_SYNC_ALTER=1 npm start
const ALTER = process.env.DB_SYNC_ALTER === '1';

sequelize.sync(ALTER ? { alter: true } : {})
  .then(() => {
    console.log(`💾 [MySQL] 数据库连接成功，表结构同步完成（alter ${ALTER ? '已开启' : '已关闭'}）。`);
    app.listen(PORT, () => {
      console.log(`\n🍳 AI 私厨流式后端已启动！`);
      console.log(`🔗 核心流式接口: http://localhost:${PORT}/api/chef/cook/stream`);
      console.log(`🩺 健康检查: http://localhost:${PORT}/health\n`);
    });
  })
  .catch(err => {
    console.error('❌ [MySQL] 数据库连接或建表失败:', err.message);
    process.exit(1);
  });
