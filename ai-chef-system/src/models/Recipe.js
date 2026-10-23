// src/models/Recipe.js
import { DataTypes } from 'sequelize';
// 统一复用 config/database.js 的连接实例。
// 之前这里自己 new 了一个 Sequelize（还硬编码了另一个库名和密码），
// 导致 index.js 的 sync 管不到这张表，查询连的也不是同一个库。
import sequelize from '../config/database.js';

const Recipe = sequelize.define('Recipe', {
  prompt: { type: DataTypes.STRING, allowNull: false },
  recipeName: { type: DataTypes.STRING, comment: '菜谱/食材名称，营养查询按此匹配' },
  cookingTime: { type: DataTypes.STRING },
  difficulty: { type: DataTypes.STRING },
  ingredients: { type: DataTypes.JSON }, // MySQL 5.7+ 原生支持 JSON
  steps: { type: DataTypes.JSON },
  nutritionTips: { type: DataTypes.TEXT },

  // 营养字段：nutrition_calculator 工具要读这几个。
  // 之前模型里没声明，Sequelize 只 select 已定义的列，取出来恒为 undefined。
  calories: { type: DataTypes.FLOAT, comment: '每 100g 热量 kcal' },
  protein: { type: DataTypes.FLOAT, comment: '每 100g 蛋白质 g' },
  fat: { type: DataTypes.FLOAT, comment: '每 100g 脂肪 g' },
  carb: { type: DataTypes.FLOAT, comment: '每 100g 碳水 g' },
}, {
  tableName: 'recipes',
  timestamps: true,
});

export default Recipe;
