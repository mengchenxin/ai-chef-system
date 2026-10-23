<script setup>
import { ref, computed, nextTick, onBeforeUnmount } from 'vue';

// 后端地址走环境变量，别硬编码在组件里（换端口/部署时不用改代码）
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:3000';

// 同一个浏览器保持同一个会话，记忆才不会丢（后端按 sessionId 存历史）。
// 右上角「新会话」会换一个新的 id —— 用它演示"换了会话就记不住"最好使。
const createSessionId = () => 'sess_' + Math.random().toString(36).slice(2, 10);
const sessionId = ref((() => {
  let id = localStorage.getItem('chef_session_id');
  if (!id) {
    id = createSessionId();
    localStorage.setItem('chef_session_id', id);
  }
  return id;
})());

const INTENT_LABEL = {
  nutrition: '营养查询',
  recipe: '菜谱做法',
  chat: '闲聊',
};

const EXAMPLES = [
  '番茄炒蛋有多少卡路里？',
  '清蒸鲈鱼怎么做？',
  '我想减脂，晚上吃什么比较好',
];

const messages = ref([]);   // [{ role, text, html, intent, status }]
const prompt = ref('');
const isGenerating = ref(false);
const listRef = ref(null);
let controller = null;

// 模型吐的是 markdown，直接显示会满屏 ** 和 #，这里做一层轻量渲染。
// 没引 markdown-it，因为只需要粗体/标题/列表三种，先转义再替换就够了。
const escapeHtml = (raw) => String(raw).replace(/[&<>"']/g, (ch) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[ch]));

const bold = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

const splitRow = (line) =>
  line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim());

const renderMarkdown = (text) => {
  const lines = escapeHtml(text || '').split('\n');
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 表格最容易翻车：模型很爱给成分/热量对比表，得认 |---|---| 这种分隔行
    if (/^\s*\|.*\|\s*$/.test(line) && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) {
      const header = splitRow(line);
      i += 2;
      const rows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(splitRow(lines[i]));
        i += 1;
      }
      const th = header.map((h) => `<th>${bold(h)}</th>`).join('');
      const tb = rows
        .map((r) => `<tr>${r.map((c) => `<td>${bold(c)}</td>`).join('')}</tr>`)
        .join('');
      out.push(`<div class="md-table"><table><thead><tr>${th}</tr></thead><tbody>${tb}</tbody></table></div>`);
      continue;
    }

    if (/^#{2,}\s+/.test(line)) {
      out.push(`<div class="md-h">${bold(line.replace(/^#{2,}\s+/, ''))}</div>`);
    } else if (/^#\s+/.test(line)) {
      out.push(`<div class="md-title">${bold(line.replace(/^#\s+/, ''))}</div>`);
    } else {
      const ordered = line.match(/^(\d+)[.、)]\s+(.*)$/);
      const bullet = line.match(/^[-•*]\s+(.*)$/);
      if (ordered) {
        out.push(`<div class="md-li"><span class="md-num">${ordered[1]}</span><span>${bold(ordered[2])}</span></div>`);
      } else if (bullet) {
        out.push(`<div class="md-li"><span class="md-dot"></span><span>${bold(bullet[1])}</span></div>`);
      } else if (line.trim() === '') {
        // 空行压成小间距，不然模型条目之间空一行会拉出很大一道缝
        out.push('<div class="md-gap"></div>');
      } else {
        out.push(`<div class="md-p">${bold(line)}</div>`);
      }
    }
    i += 1;
  }

  return out.join('\n');
};

const scrollToBottom = async () => {
  await nextTick();
  if (listRef.value) listRef.value.scrollTop = listRef.value.scrollHeight;
};

const stop = () => {
  if (controller) controller.abort();
};

const startNewSession = () => {
  if (isGenerating.value) return;
  const id = createSessionId();
  localStorage.setItem('chef_session_id', id);
  sessionId.value = id;
  messages.value = [];
};

const startCooking = async () => {
  const text = prompt.value.trim();
  if (!text || isGenerating.value) return;

  messages.value.push({ role: 'user', text, html: renderMarkdown(text) });
  prompt.value = '';
  const reply = { role: 'assistant', text: '', html: '', intent: '', status: '' };
  messages.value.push(reply);

  isGenerating.value = true;
  await scrollToBottom();

  controller = new AbortController();

  try {
    const response = await fetch(`${API_BASE}/api/chef/cook/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: text, sessionId: sessionId.value }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body.error || `服务返回 ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      // 关键：一个 SSE 事件可能被 TCP 拆成多个 chunk。
      // 必须把半截数据留在 buffer 里等下一片，不能直接按行切完就解析。
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split('\n\n');
      buffer = events.pop() ?? '';

      for (const raw of events) {
        const line = raw.split('\n').find((l) => l.startsWith('data:'));
        if (!line) continue;

        let event;
        try {
          event = JSON.parse(line.slice(5).trim());
        } catch {
          continue; // 单条解析失败不该影响整段对话
        }

        if (event.intent) {
          reply.intent = event.intent;
        } else if (event.status === 'tool_running') {
          reply.status = '正在翻阅食材数据库…';
        } else if (event.text) {
          reply.status = '';
          reply.text += event.text;
          reply.html = renderMarkdown(reply.text);
        }
        scrollToBottom();
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      reply.text += '\n\n（已停止）';
    } else {
      reply.text = `⚠️ 生成失败：${err.message}\n\n请确认后端已启动（${API_BASE}）。`;
    }
    reply.html = renderMarkdown(reply.text);
  } finally {
    reply.status = '';
    isGenerating.value = false;
    controller = null;
    scrollToBottom();
  }
};

const onKeydown = (e) => {
  // Enter 发送，Shift+Enter 换行
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    startCooking();
  }
};

const useExample = (text) => {
  prompt.value = text;
  startCooking();
};

onBeforeUnmount(() => {
  if (controller) controller.abort();
});
</script>

<template>
  <div class="shell">
    <div class="chat-container">
      <header class="header">
        <div class="brand">
          <div class="avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6.5 12.2a4 4 0 1 1 1.8-7.6 4.6 4.6 0 0 1 7.4 0 4 4 0 1 1 1.8 7.6v5.3a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5v-5.3Z"/>
              <path d="M9.2 19v1.6M14.8 19v1.6"/>
            </svg>
          </div>
          <div class="brand-text">
            <h2>私厨小助手</h2>
            <p>记得你的口味、过敏和忌口</p>
          </div>
        </div>
        <div class="header-right">
          <span class="badge" :class="{ live: isGenerating }">
            <i class="dot"></i>{{ isGenerating ? '生成中' : '在线' }}
          </span>
          <button class="ghost" title="换一个全新会话，记忆从零开始" @click="startNewSession">
            新会话
          </button>
        </div>
      </header>

      <main ref="listRef" class="messages">
        <div v-if="!messages.length" class="empty">
          <div class="empty-icon">
            <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M7 23h34a17 17 0 0 1-34 0Z"/>
              <path d="M18 15c0-2.6 1.8-2.8 1.8-5.4M27 15c0-2.6 1.8-2.8 1.8-5.4"/>
            </svg>
          </div>
          <p class="empty-title">今天想吃点什么？</p>
          <p class="empty-sub">试试下面这些，或者直接说说你的需求</p>
          <div class="examples">
            <button v-for="ex in EXAMPLES" :key="ex" class="example" @click="useExample(ex)">
              {{ ex }}
            </button>
          </div>
        </div>

        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="row"
          :class="msg.role"
        >
          <div v-if="msg.role === 'assistant'" class="mini-avatar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M6.5 12.2a4 4 0 1 1 1.8-7.6 4.6 4.6 0 0 1 7.4 0 4 4 0 1 1 1.8 7.6v5.3a1.5 1.5 0 0 1-1.5 1.5h-8a1.5 1.5 0 0 1-1.5-1.5v-5.3Z"/>
            </svg>
          </div>
          <div class="bubble">
            <div v-if="msg.intent" class="intent" :class="msg.intent">
              {{ INTENT_LABEL[msg.intent] || msg.intent }}
            </div>
            <div class="content" v-html="msg.html"></div>
            <div v-if="msg.status" class="status">{{ msg.status }}</div>
            <div v-if="msg.role === 'assistant' && !msg.text && !msg.status" class="typing">
              <i></i><i></i><i></i>
            </div>
          </div>
        </div>
      </main>

      <footer class="composer">
        <div class="input-wrap">
          <textarea
            v-model="prompt"
            rows="2"
            placeholder="说说你想吃什么，比如「番茄炒蛋有多少卡路里」"
            @keydown="onKeydown"
          ></textarea>
        </div>
        <button v-if="!isGenerating" class="send" :disabled="!prompt.trim()" @click="startCooking">
          发送
        </button>
        <button v-else class="send stop" @click="stop">停止</button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  padding: 24px 16px;
  background:
    radial-gradient(1100px 500px at 12% -10%, #ffe9d2 0%, rgba(255, 233, 210, 0) 60%),
    radial-gradient(900px 460px at 88% 0%, #ffeede 0%, rgba(255, 238, 222, 0) 55%),
    linear-gradient(170deg, #fdfaf6 0%, #f6efe6 100%);
  display: flex;
  justify-content: center;
  font-family: 'Segoe UI', 'Microsoft YaHei', system-ui, sans-serif;
  color: #2b2118;
}

.chat-container {
  width: 100%;
  max-width: 760px;
  height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.86);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(232, 118, 58, 0.14);
  border-radius: 22px;
  box-shadow:
    0 24px 60px -28px rgba(122, 78, 43, 0.35),
    0 2px 8px rgba(122, 78, 43, 0.05);
  overflow: hidden;
}

/* ---------- header ---------- */
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
  background: linear-gradient(180deg, #fffdfa, #fff8f0);
  border-bottom: 1px solid #f3e7d9;
}
.brand { display: flex; align-items: center; gap: 12px; }
.avatar {
  width: 42px; height: 42px;
  display: grid; place-items: center;
  color: #fff;
  border-radius: 13px;
  background: linear-gradient(140deg, #ffb877, #e8763a);
  box-shadow: 0 6px 16px -6px rgba(232, 118, 58, 0.7);
}
.avatar svg { width: 22px; height: 22px; }
.brand-text h2 { margin: 0; font-size: 16px; letter-spacing: .3px; }
.brand-text p { margin: 2px 0 0; font-size: 12px; color: #a68a72; }

.header-right { display: flex; align-items: center; gap: 10px; }
.badge {
  display: inline-flex; align-items: center; gap: 5px;
  font-size: 11.5px; font-weight: 600;
  color: #3f8f63;
  background: #eaf7ef;
  border: 1px solid #cfeadd;
  padding: 3px 9px; border-radius: 999px;
}
.badge .dot { width: 5px; height: 5px; border-radius: 50%; background: #45b57c; }
.badge.live { color: #b45309; background: #fff3e4; border-color: #f7dcbe; }
.badge.live .dot { background: #e8763a; animation: pulse 1.1s infinite; }
@keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: .25; } }

.ghost {
  font-size: 12.5px;
  color: #8a6a52;
  background: transparent;
  border: 1px solid #ecdccc;
  border-radius: 9px;
  padding: 6px 11px;
  cursor: pointer;
  transition: .16s;
}
.ghost:hover { background: #fff2e4; border-color: #e8c9ac; color: #b45309; }

/* ---------- messages ---------- */
.messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scroll-behavior: smooth;
}
.messages::-webkit-scrollbar { width: 6px; }
.messages::-webkit-scrollbar-thumb { background: #e6d7c8; border-radius: 3px; }
.messages::-webkit-scrollbar-track { background: transparent; }

.empty {
  margin: auto;
  text-align: center;
  padding: 20px;
}
.empty-icon { color: #e8a06a; margin-bottom: 6px; }
.empty-icon svg { width: 46px; height: 46px; }
.empty-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; color: #5a4331; }
.empty-sub { margin: 0 0 18px; font-size: 13px; color: #a68a72; }
.examples { display: flex; flex-direction: column; gap: 8px; align-items: center; }
.example {
  font-size: 13px;
  color: #7a4e2b;
  background: #fffdfa;
  border: 1px solid #f0dfcd;
  border-radius: 11px;
  padding: 9px 15px;
  cursor: pointer;
  transition: .16s;
  font-family: inherit;
}
.example:hover {
  background: #fff4e8;
  border-color: #f0c9a4;
  transform: translateY(-1px);
  box-shadow: 0 6px 14px -8px rgba(180, 83, 9, .45);
}

.row { display: flex; gap: 9px; align-items: flex-start; animation: rise .26s ease both; }
.row.user { justify-content: flex-end; }
@keyframes rise { from { opacity: 0; transform: translateY(7px); } to { opacity: 1; transform: none; } }

.mini-avatar {
  flex: 0 0 auto;
  width: 28px; height: 28px;
  display: grid; place-items: center;
  color: #b45309;
  border-radius: 9px;
  background: linear-gradient(140deg, #ffe3c6, #ffcda1);
  margin-top: 2px;
}
.mini-avatar svg { width: 15px; height: 15px; }

.bubble {
  max-width: 78%;
  padding: 12px 15px;
  border-radius: 15px;
  font-size: 14.5px;
  background: #fff;
  border: 1px solid #f1e5d8;
  box-shadow: 0 4px 14px -10px rgba(122, 78, 43, .5);
  border-top-left-radius: 6px;
}
.row.user .bubble {
  background: linear-gradient(140deg, #f7a35c, #e8763a);
  border: none;
  color: #fff;
  border-top-left-radius: 15px;
  border-top-right-radius: 6px;
  box-shadow: 0 8px 20px -12px rgba(232, 118, 58, .9);
}

.intent {
  display: inline-block;
  font-size: 10.5px; font-weight: 600;
  padding: 2px 9px;
  margin-bottom: 7px;
  border-radius: 999px;
  background: #eef3f8; color: #48627d; border: 1px solid #dbe6f0;
}
.intent.nutrition { background: #e8f6f2; color: #0f766e; border-color: #c9e9e2; }
.intent.recipe    { background: #fff4e4; color: #b45309; border-color: #f8ddba; }
.intent.chat      { background: #f3eefb; color: #6d4fa8; border-color: #e3d8f5; }

.content { line-height: 1.72; word-break: break-word; }
.content :deep(.md-p) { margin: 2px 0; }
.content :deep(.md-gap) { height: 5px; }
.content :deep(.md-title) { font-size: 16px; font-weight: 800; margin: 2px 0 6px; color: #4a3320; }
.content :deep(.md-h) { font-size: 14.5px; font-weight: 700; margin: 10px 0 4px; color: #6b4a2e; }
.content :deep(.md-li) { display: flex; gap: 7px; margin: 3px 0; }
.content :deep(.md-num) {
  flex: 0 0 auto;
  min-width: 17px; height: 17px;
  display: inline-grid; place-items: center;
  font-size: 11px; font-weight: 700;
  color: #fff; background: #e8a06a;
  border-radius: 6px; margin-top: 3px;
}
.content :deep(.md-dot) {
  flex: 0 0 auto;
  width: 5px; height: 5px; margin-top: 9px;
  border-radius: 50%; background: #e8a06a;
}
.content :deep(strong) { color: #b45309; font-weight: 700; }
.row.user .content :deep(strong) { color: #fff; }

.content :deep(.md-table) { margin: 9px 0; overflow-x: auto; border-radius: 10px; border: 1px solid #f2e5d7; }
.content :deep(.md-table table) { border-collapse: collapse; width: 100%; font-size: 13.5px; }
.content :deep(.md-table th) {
  background: #fdf1e4; color: #8a5a2b;
  font-weight: 700; text-align: left;
  padding: 6px 10px; border-bottom: 1px solid #f2e5d7;
}
.content :deep(.md-table td) { padding: 6px 10px; border-top: 1px solid #f6ece1; }
.content :deep(.md-table tr:nth-child(even) td) { background: #fffaf4; }

.status { margin-top: 6px; font-size: 12px; color: #a68a72; }
.status::before { content: '⏳ '; }

.typing { display: inline-flex; gap: 4px; padding: 3px 0; }
.typing i {
  width: 6px; height: 6px; border-radius: 50%;
  background: #e8b98a;
  animation: blink 1.15s infinite;
}
.typing i:nth-child(2) { animation-delay: .16s; }
.typing i:nth-child(3) { animation-delay: .32s; }
@keyframes blink { 0%,80%,100% { opacity: .28; transform: scale(.9); } 40% { opacity: 1; transform: scale(1); } }

/* ---------- composer ---------- */
.composer {
  display: flex; gap: 10px;
  padding: 14px 20px 18px;
  background: linear-gradient(180deg, #fffaf4, #fffdfa);
  border-top: 1px solid #f3e7d9;
}
.input-wrap {
  flex: 1;
  background: #fff;
  border: 1px solid #ecdccc;
  border-radius: 14px;
  padding: 2px;
  transition: .16s;
}
.input-wrap:focus-within {
  border-color: #e8a06a;
  box-shadow: 0 0 0 3px rgba(232, 118, 58, .12);
}
.composer textarea {
  width: 100%;
  resize: none;
  padding: 9px 12px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 14.5px;
  line-height: 1.6;
  font-family: inherit;
  color: #2b2118;
}
.composer textarea::placeholder { color: #b9a18c; }

.send {
  flex: 0 0 auto;
  width: 84px;
  border: none;
  border-radius: 14px;
  background: linear-gradient(140deg, #f7a35c, #e8763a);
  color: #fff;
  font-size: 14.5px;
  font-weight: 700;
  letter-spacing: .5px;
  cursor: pointer;
  transition: .16s;
  box-shadow: 0 8px 18px -10px rgba(232, 118, 58, .95);
}
.send:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 22px -10px rgba(232, 118, 58, .95); }
.send:disabled { background: #f0d9c6; color: #fff; cursor: not-allowed; box-shadow: none; }
.send.stop { background: linear-gradient(140deg, #f0837a, #d9534f); }

@media (max-width: 560px) {
  .shell { padding: 0; }
  .chat-container { height: 100vh; border-radius: 0; border: none; }
  .bubble { max-width: 86%; }
  .brand-text p { display: none; }
}
</style>
