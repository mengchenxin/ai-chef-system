// src/agent/intentRules.js
// 意图识别的规则层，单独抽出来有两个好处：
//   1. chefGraph 只依赖它的结果，规则改动不需要碰图结构；
//   2. 它是纯函数，测试不需要连数据库、不需要 API key，能直接跑。
//
// 顺序有讲究：营养类放在前面。"番茄炒蛋有多少卡路里"同时命中两个规则，
// 用户真实意图是查营养，所以营养必须先判。

export const INTENT_RULES = [
  {
    intent: "nutrition",
    re: /(营养|热量|卡路里|蛋白质|脂肪|碳水|多少卡|千卡|kcal|成分|含有什么)/i,
  },
  {
    intent: "recipe",
    re: /(怎么做|做法|步骤|菜谱|教程|烹饪|炒|煮|蒸|烤|煎|炖|凉拌|配料|食材准备)/i,
  },
];

/**
 * 规则命中就返回意图，命中不了返回 null（交给模型兜底）。
 * @param {string} text 用户输入
 * @returns {"nutrition"|"recipe"|null}
 */
export function ruleClassify(text) {
  const input = String(text || "");
  if (!input) return null;
  for (const rule of INTENT_RULES) {
    if (rule.re.test(input)) return rule.intent;
  }
  return null;
}
