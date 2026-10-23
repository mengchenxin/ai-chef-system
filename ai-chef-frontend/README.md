# AI 私厨 · 前端

一个 AI 菜谱助手的前端：问营养、要做法、闲聊，后端按意图自动分流并带记忆。

配套后端：[ai-chef-system](../ai-chef-system)（Node + LangGraph + MySQL）

---

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Vue 3（`<script setup>`） |
| 构建 | Vite |
| 通信 | `fetch` + `ReadableStream` 手写 SSE 解析 |

没有引入 UI 库和状态管理——这个体量用不上，加了反而多一层噪音。

## 快速开始

```bash
npm install
cp .env.example .env       # 配后端地址
npm run dev                # http://localhost:5173
```

后端要先跑起来（默认 `http://localhost:3000`），否则页面会提示连接失败。

## 目录结构

```
src/
├── App.vue                  # 只挂载 ChefChat
├── components/
│   └── ChefChat.vue         # 全部界面与流式逻辑
└── main.js
```

## 和后端的约定

### 请求

```http
POST /api/chef/cook/stream
Content-Type: application/json

{ "prompt": "番茄炒蛋有多少卡路里", "sessionId": "sess_ab12cd34" }
```

`sessionId` 由前端生成并存在 `localStorage`，后端按它存对话历史。**同一浏览器 = 同一个会话**，清掉 `chef_session_id` 刷新即开始新会话。

### 响应（SSE）

服务端逐条推 `data: {...}\n\n`，共三种事件：

| 事件 | 含义 | 前端处理 |
|---|---|---|
| `{ "intent": "nutrition" }` | 意图分类结果（nutrition / recipe / chat） | 显示成气泡上的标签 |
| `{ "status": "tool_running", "tool": "..." }` | 正在调工具查库 | 显示「正在查询营养库…」 |
| `{ "text": "..." }` | 一段回答正文 | 追加到气泡 |

### 两个容易踩的坑

1. **SSE 不能按行切**。一个事件可能被 TCP 拆成多个 chunk，必须维护 buffer、按 `\n\n` 切分、把最后半截留到下一轮。否则长回答会随机丢字。
2. **状态事件不要混进正文**。「正在查库」这类提示如果用 `text` 事件下发，会被当成回答内容追加，用户看到的和写进历史的就不一致了。

## 测试

前端暂无自动化测试。要验证流式解析，可以绕开界面直接打后端：

```bash
curl -N -X POST http://localhost:3000/api/chef/cook/stream \
  -H "Content-Type: application/json" \
  -d '{"prompt":"番茄炒蛋的热量","sessionId":"test01"}'
```

## 已知限制

- 回答是纯文本渲染（`white-space: pre-wrap`），没有做 Markdown；菜谱的结构靠提示词里的固定分段来保证
- 没有历史会话列表，刷新后只能看到新对话（历史还在后端库里）
- 单用户配置，没有登录和鉴权
