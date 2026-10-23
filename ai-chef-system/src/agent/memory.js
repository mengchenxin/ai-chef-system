// src/agent/memory.js
// 三级记忆：
//   第一级 短期 —— 滑动窗口，只留最近 WINDOW_TURNS 轮对话，控制 token
//   第二级 中期 —— 被窗口挤出去的早期对话，压成一段摘要
//   第三级 长期 —— 从对话里抽出的用户画像（过敏、忌口、口味），每轮注入 system prompt
// 摘要和画像都走独立的小模型调用，失败不影响主流程。
import Session from "../models/Session.js";
import { llmFast } from "./llm.js";

const WINDOW_TURNS = 6;        // 窗口内保留 6 轮（12 条消息）
const PROFILE_REFRESH_EVERY = 3; // 每 3 轮刷新一次画像，别每轮都调模型

export async function loadSession(sessionId) {
  const [session] = await Session.findOrCreate({
    where: { sessionId },
    defaults: {
      sessionId,
      summary: "",
      profile: {},
      history: [],
      turnCount: 0,
    },
  });
  return session;
}

function buildSystemPrompt(profile, summary) {
  const parts = [
    `你是"私厨小助手"，一位耐心、专业的厨师。回答要具体，不要空话。`,
  ];

  const profileEntries = Object.entries(profile || {}).filter(([, v]) => {
    if (Array.isArray(v)) return v.length > 0;
    return v !== "" && v !== null && v !== undefined;
  });

  if (profileEntries.length) {
    const readable = profileEntries
      .map(([key, value]) => `${key}：${Array.isArray(value) ? value.join("、") : value}`)
      .join("；");
    parts.push(`【已知用户信息，回答时必须遵守】${readable}`);
  }

  if (summary) {
    parts.push(`【更早的对话摘要】${summary}`);
  }

  return parts.join("\n\n");
}

async function compressHistory(oldSummary, overflowMessages) {
  const transcript = overflowMessages
    .map(m => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n");

  try {
    const res = await llmFast.invoke([
      {
        role: "system",
        content:
          "把下面的对话压缩成不超过 150 字的摘要。必须保留：用户的过敏项、忌口、口味偏好、已经聊过或做过的菜。只输出摘要正文，不要解释。",
      },
      {
        role: "user",
        content: `${oldSummary ? `已有摘要：${oldSummary}\n\n` : ""}需要压缩的对话：\n${transcript}`,
      },
    ]);
    const summary = String(res.content).trim();
    console.log(`[Memory] 摘要已压缩，${overflowMessages.length} 条 → ${summary.length} 字`);
    return summary;
  } catch (e) {
    // 返回 null 而不是旧摘要：调用方据此判断"这轮别裁剪"，
    // 否则 overflow 被丢弃、摘要又没更新，等于静默丢对话。
    console.warn("[Memory] 摘要压缩失败，本轮不裁剪历史：", e.message);
    return null;
  }
}

// 组装这次请求要发给模型的消息：system(画像+摘要) + 窗口内历史 + 本次输入
export async function prepareMessages(session, userText) {
  let history = Array.isArray(session.history) ? [...session.history] : [];
  let summary = session.summary || "";
  const profile = session.profile || {};

  const maxMessages = WINDOW_TURNS * 2;
  if (history.length > maxMessages) {
    const overflow = history.slice(0, history.length - maxMessages);
    const nextSummary = await compressHistory(summary, overflow);

    if (nextSummary !== null) {
      // 压缩成功：裁掉溢出部分，摘要和窗口一起落库（不然下次还用旧的）
      summary = nextSummary;
      history = history.slice(history.length - maxMessages);
      session.summary = summary;
      session.history = history;
      await session.save();
    } else if (history.length > maxMessages * 3) {
      // 连续失败到硬上限了，宁可丢最早的部分，也不能让上下文无限膨胀
      console.warn("[Memory] 摘要连续失败，历史达到硬上限，强制裁剪到窗口内");
      history = history.slice(history.length - maxMessages);
      session.history = history;
      await session.save();
    }
    // 其他情况（偶发失败）：保留完整历史，下轮再试着压缩
  }

  return {
    messages: [
      { role: "system", content: buildSystemPrompt(profile, summary) },
      ...history,
      { role: "user", content: userText },
    ],
    windowSize: history.length,
    summary,
    profile,
  };
}

export async function appendTurn(session, userText, assistantText) {
  const history = Array.isArray(session.history) ? [...session.history] : [];
  history.push({ role: "user", content: userText });
  if (assistantText) history.push({ role: "assistant", content: assistantText });

  session.history = history;
  session.turnCount = (session.turnCount || 0) + 1;
  await session.save();

  return session;
}

// 第三级记忆：定期把最近对话丢给模型，抽出结构化画像
export async function maybeRefreshProfile(session) {
  const turn = session.turnCount || 0;
  if (turn === 0 || turn % PROFILE_REFRESH_EVERY !== 0) return;

  const recent = (session.history || [])
    .slice(-8)
    .map(m => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n");

  try {
    const res = await llmFast.invoke([
      {
        role: "system",
        content:
          '从对话里抽取用户的饮食画像，只输出 JSON：{"allergy":[],"dislike":[],"taste":[],"goal":""}。' +
          "没有提到的字段给空数组或空字符串，不要编造。只输出 JSON，不要代码块。",
      },
      { role: "user", content: recent },
    ]);

    const jsonText = String(res.content).replace(/```json/gi, "").replace(/```/g, "").trim();
    const parsed = JSON.parse(jsonText);

    session.profile = { ...(session.profile || {}), ...parsed };
    await session.save();
    console.log("[Memory] 用户画像已更新：", JSON.stringify(session.profile));
  } catch (e) {
    // 画像抽不出来不该影响这次回答，记一笔就过
    console.warn("[Memory] 画像抽取失败（不影响主流程）：", e.message);
  }
}
