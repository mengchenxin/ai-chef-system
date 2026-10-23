// src/models/Session.js
import { DataTypes } from "sequelize";
import sequelize from "../config/database.js";

// 一次会话一行。三级记忆都挂在同一个 sessionId 下面：
//   history  —— 短期，滑动窗口内的近期对话
//   summary  —— 中期，被窗口挤出去的历史压成的摘要
//   profile  —— 长期，从对话里抽出来的用户画像
const Session = sequelize.define("Session", {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    comment: "前端传来的会话标识，同一标识的对话共享记忆",
  },
  summary: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: "超出窗口的早期对话压缩后的摘要",
  },
  profile: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "用户画像：过敏、忌口、口味偏好、目标",
  },
  history: {
    type: DataTypes.JSON,
    allowNull: true,
    comment: "滑动窗口内的近期对话 [{role, content}]",
  },
  turnCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: "累计对话轮数，用来决定什么时候刷新画像",
  },
}, {
  timestamps: true,
});

export default Session;
