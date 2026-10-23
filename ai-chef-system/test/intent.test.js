// test/intent.test.js
// 只测规则层：不连数据库、不需要 API key，`npm test` 直接能跑。
// 规则层是第一个"便宜"的判断，它判错了会让后面的模型调用白花，所以值得钉死。
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ruleClassify } from '../src/agent/intentRules.js';

describe('规则层意图识别', () => {
  test('营养类：常见问法都能命中', () => {
    const cases = [
      '三文鱼有多少卡路里',
      '这个菜的热量高吗',
      '鸡蛋含有什么营养成分',
      '蛋白质够不够',
      '一份多少 kcal',
    ];
    for (const q of cases) {
      assert.equal(ruleClassify(q), 'nutrition', `应该判为 nutrition：${q}`);
    }
  });

  test('营养优先于菜谱：同时含"炒"和"热量"时判营养', () => {
    // 这是规则顺序的关键用例。用户问"番茄炒蛋有多少卡路里"，
    // 真实意图是查营养而不是要做法，如果 recipe 规则排在前面就会误判。
    assert.equal(ruleClassify('番茄炒蛋有多少卡路里'), 'nutrition');
    assert.equal(ruleClassify('炒青菜的热量'), 'nutrition');
  });

  test('菜谱类：要做法时命中', () => {
    const cases = ['红烧肉怎么做', '给我一个番茄炒蛋的菜谱', '清蒸鱼的做法和步骤'];
    for (const q of cases) {
      assert.equal(ruleClassify(q), 'recipe', `应该判为 recipe：${q}`);
    }
  });

  test('闲聊：规则不命中，留给模型兜底', () => {
    const cases = ['你好', '今天吃什么好呢', '谢谢你的建议'];
    for (const q of cases) {
      assert.equal(ruleClassify(q), null, `不应该被规则命中：${q}`);
    }
  });

  test('边界：空值与非法输入不抛错', () => {
    assert.equal(ruleClassify(''), null);
    assert.equal(ruleClassify(undefined), null);
    assert.equal(ruleClassify(null), null);
    assert.equal(ruleClassify(12345), null);
  });
});
