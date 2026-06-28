// src/agent/tools.js (建议专门放工具代码，保持代码整洁)
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import Recipe from "../models/Recipe.js"; // 导入你的模型

export const nutritionTool = tool(async ({ foodName }) => {
  // 模拟：从数据库查询该食材的营养数据
  // 真实场景：你可以写复杂的 SQL 查询或调用第三方营养数据库 API
  const data = await Recipe.findOne({ where: { recipeName: foodName } });
  
  if (!data) return `未找到关于 ${foodName} 的营养记录。`;
  return `食材 ${foodName} 的详细营养: 热量 ${data.calories}kcal, 蛋白质 ${data.protein}g。`;
}, {
  name: "nutrition_calculator",
  description: "当用户询问特定食材或菜谱的营养信息时调用此工具",
  schema: z.object({ foodName: z.string().describe("食材或菜谱的名称") }),
});