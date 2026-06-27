import { Sequelize, DataTypes } from 'sequelize';

// 这里填入你本地 MySQL 的真实信息
export const sequelize = new Sequelize('ai_chef', 'root', 'root', {
  host: '127.0.0.1',
  dialect: 'mysql',
  logging: false
});

const Recipe = sequelize.define('Recipe', {
  prompt: { type: DataTypes.STRING, allowNull: false },
  recipeName: { type: DataTypes.STRING },
  cookingTime: { type: DataTypes.STRING },
  difficulty: { type: DataTypes.STRING },
  ingredients: { type: DataTypes.JSON }, // MySQL 5.7+ 原生支持 JSON
  steps: { type: DataTypes.JSON },
  nutritionTips: { type: DataTypes.TEXT }
}, {
  tableName: 'recipes',
  timestamps: true
});

export default Recipe;