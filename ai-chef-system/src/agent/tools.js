// src/agent/tools.js
import { tool } from "@langchain/core/tools";
import { Op } from "sequelize";
import { z } from "zod";
import Recipe from "../models/Recipe.js";

// 数值可能为 NULL（库里的历史数据没有营养字段），统一兜成"未知"，
// 避免出现 "热量 undefinedkcal" 这种现场翻车。
const fmt = (v, unit) => (v === null || v === undefined || v === "" ? "未知" : `${v} ${unit}`);

export const nutritionTool = tool(async ({ foodName }) => {
  try {
    // 精确等值命中率太低：用户问"三文鱼"，库里多半叫"香煎三文鱼"或"三文鱼刺身"。
    const data = await Recipe.findOne({
      where: { recipeName: { [Op.like]: `%${foodName}%` } },
      order: [["recipeName", "ASC"]],
    });

    if (!data) {
      return `营养库里没有找到「${foodName}」的记录。可以换个说法，或者直接问做法。`;
    }

    return [
      `【${data.recipeName}】的营养成分（每 100g）：`,
      `- 热量：${fmt(data.calories, "kcal")}`,
      `- 蛋白质：${fmt(data.protein, "g")}`,
      `- 脂肪：${fmt(data.fat, "g")}`,
      `- 碳水：${fmt(data.carb, "g")}`,
      data.nutritionTips ? `- 提示：${data.nutritionTips}` : "",
    ].filter(Boolean).join("\n");
  } catch (e) {
    // 表没建、连接断了都不该让整个对话挂掉，降级成"告知用户数据不可用"。
    console.warn("[Tool] 营养查询失败：", e.message);
    return `营养查询暂时不可用（${e.message}）。请按常见食材的一般营养水平回答，并明确告诉用户这不是查库结果。`;
  }
}, {
  name: "nutrition_calculator",
  description: "查询本地营养库中某道菜或某种食材的热量、蛋白质、脂肪、碳水。用户问营养、热量、卡路里、成分时调用。",
  schema: z.object({ foodName: z.string().describe("食材或菜谱的名称，如 三文鱼、番茄炒蛋") }),
});
