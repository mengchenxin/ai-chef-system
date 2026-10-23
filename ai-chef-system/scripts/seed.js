// scripts/seed.js
// 演示用初始数据：给营养工具准备一张有内容的表。
//
// ⚠️ 数值是常见食物成分参考值（每 100g），用于本地演示和开发调试，
//    不是权威检测结果，也不构成营养建议。实际产品应接权威食物成分库。
import 'dotenv/config';
import sequelize from '../src/config/database.js';
import Recipe from '../src/models/Recipe.js';

const rows = [
  { recipeName: '三文鱼', calories: 208, protein: 20.4, fat: 13.4, carb: 0,
    cookingTime: '15 分钟', difficulty: '简单',
    nutritionTips: '富含 Omega-3，适合低温慢煎或少油烤' },
  { recipeName: '番茄炒蛋', calories: 90, protein: 5.4, fat: 6.2, carb: 4.0,
    cookingTime: '10 分钟', difficulty: '简单',
    nutritionTips: '番茄的维C 搭配鸡蛋蛋白，油脂帮助番茄红素吸收' },
  { recipeName: '清蒸鲈鱼', calories: 105, protein: 18.6, fat: 3.4, carb: 0,
    cookingTime: '20 分钟', difficulty: '中等',
    nutritionTips: '高蛋白低脂，蒸制能最大程度保留营养' },
  { recipeName: '鸡胸肉', calories: 165, protein: 31.0, fat: 3.6, carb: 0,
    cookingTime: '15 分钟', difficulty: '简单',
    nutritionTips: '典型的高蛋白低脂食材，注意不要过度加热变柴' },
  { recipeName: '西兰花', calories: 34, protein: 2.8, fat: 0.4, carb: 7.0,
    cookingTime: '5 分钟', difficulty: '简单',
    nutritionTips: '焯水时间不宜过长，水溶性维生素易流失' },
  { recipeName: '番茄', calories: 18, protein: 0.9, fat: 0.2, carb: 3.9,
    cookingTime: '—', difficulty: '—',
    nutritionTips: '生吃补维C，熟吃更利于番茄红素吸收' },
  { recipeName: '鸡蛋', calories: 143, protein: 12.6, fat: 9.5, carb: 0.7,
    cookingTime: '8 分钟', difficulty: '简单',
    nutritionTips: '氨基酸组成接近人体需要，吸收率高' },
  { recipeName: '瘦牛肉', calories: 250, protein: 26.0, fat: 15.0, carb: 0,
    cookingTime: '30 分钟', difficulty: '中等',
    nutritionTips: '富含血红素铁，搭配维C 食物有助吸收' },
  { recipeName: '米饭', calories: 116, protein: 2.6, fat: 0.3, carb: 25.9,
    cookingTime: '30 分钟', difficulty: '简单',
    nutritionTips: '主要提供碳水，控糖人群注意份量' },
  { recipeName: '豆腐', calories: 76, protein: 8.1, fat: 4.8, carb: 1.9,
    cookingTime: '10 分钟', difficulty: '简单',
    nutritionTips: '植物蛋白来源，含钙（石膏点卤的更高）' },
];

async function main() {
  await sequelize.authenticate();
  console.log('数据库已连接，开始写入演示数据…');

  let created = 0;
  let skipped = 0;

  for (const row of rows) {
    const [, isNew] = await Recipe.findOrCreate({
      where: { recipeName: row.recipeName },
      defaults: { prompt: `[seed] ${row.recipeName}`, ...row },
    });
    if (isNew) created += 1; else skipped += 1;
  }

  const total = await Recipe.count();
  console.log(`完成：新增 ${created} 条，跳过 ${skipped} 条（已存在），表内共 ${total} 条。`);
  await sequelize.close();
}

main().catch((err) => {
  console.error('写入失败：', err.message);
  process.exit(1);
});
