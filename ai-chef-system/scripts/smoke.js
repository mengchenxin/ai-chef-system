// scripts/smoke-test.js
// 冒烟测试：对着跑起来的服务验证 意图路由 → 工具调用 → 三级记忆 是否正常。
// 用法：先 npm start，再 node scripts/smoke-test.js
// 会真实消耗少量模型 token，别放进 CI 的每次提交里。
import 'dotenv/config';

const BASE = process.env.BASE_URL || 'http://localhost:3000';

async function ask(prompt, sessionId) {
  const res = await fetch(`${BASE}/api/chef/cook/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, sessionId }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }

  let intent = '';
  let toolUsed = false;
  let text = '';
  let buffer = '';
  const decoder = new TextDecoder();

  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() ?? '';
    for (const raw of events) {
      const line = raw.split('\n').find((l) => l.startsWith('data:'));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(5).trim()); } catch { continue; }
      if (ev.intent) intent = ev.intent;
      else if (ev.status === 'tool_running') toolUsed = true;
      else if (ev.text) text += ev.text;
    }
  }
  return { intent, toolUsed, text };
}

const results = [];
const check = (name, pass, detail) => {
  results.push({ name, pass, detail });
  console.log(`${pass ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`);
};

async function main() {
  const health = await fetch(`${BASE}/health`).then((r) => r.json()).catch(() => null);
  if (!health?.ok) {
    console.error(`服务没起来或不可达：${BASE}`);
    process.exit(1);
  }
  console.log(`服务正常（uptime ${health.uptime.toFixed(0)}s），开始冒烟测试\n`);

  const sid = 'smoke-' + Date.now().toString(36);

  // 1. 营养类：应走规则、调工具，并命中库里的数据
  const r1 = await ask('番茄炒蛋有多少卡路里', sid);
  check('营养意图走规则', r1.intent === 'nutrition');
  check('营养查询调用工具', r1.toolUsed);
  check('工具数据进入回答', /90\s*kcal/.test(r1.text), '期望出现 90 kcal');

  // 2. 菜谱类：不调工具，且有结构化分段
  const r2 = await ask('清蒸鱼怎么做', sid);
  check('菜谱意图走规则', r2.intent === 'recipe');
  check('菜谱不调工具', !r2.toolUsed);
  check('菜谱结构化输出', /用料|步骤/.test(r2.text));

  // 3. 闲聊：交给模型判定
  const r3 = await ask('你好', sid);
  check('闲聊意图走模型', r3.intent === 'chat');

  // 4. 三级记忆：同一会话里先说忌口，再回问，回答应当带上
  const memSid = 'smoke-mem-' + Date.now().toString(36);
  await ask('我花生过敏，也不吃香菜，口味偏清淡', memSid);
  const r4 = await ask('我有什么忌口？', memSid);
  check('记忆能跨轮带出忌口', /花生|香菜/.test(r4.text), '期望提到花生或香菜');

  const failed = results.filter((r) => !r.pass).length;
  console.log(`\n${results.length - failed}/${results.length} 通过`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('冒烟测试异常：', err.message);
  process.exit(1);
});
