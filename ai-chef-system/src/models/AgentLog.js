// src/models/AgentLog.js
import { DataTypes } from "sequelize";
import sequelize from "../config/database.js"; // 确保引入了你的数据库实例

const AgentLog = sequelize.define("AgentLog", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userPrompt: {
    type: DataTypes.TEXT,
    allowNull: false,
    comment: "用户的原始输入内容",
  },
  // 核心：用 JSON 类型存储完整的 ReAct 推理链轨迹
  executionTrace: {
    type: DataTypes.JSON,
    allowNull: false,
    comment: "中间节点的执行轨迹，包括节点名、工具调用参数和返回值",
  },
  finalResponse: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "Agent 最终给出的回答",
  },
}, {
  timestamps: true, // 自动生成 createdAt 和 updatedAt
});

export default AgentLog;