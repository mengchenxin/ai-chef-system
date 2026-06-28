// src/config/database.js
import { Sequelize } from 'sequelize';
import 'dotenv/config';

// 创建 Sequelize 实例，直接读取 .env 中的数据库配置
const sequelize = new Sequelize(
  process.env.DB_NAME || 'ai_chef_db',     // 数据库名
  process.env.DB_USER || 'root',           // 用户名
  process.env.DB_PASSWORD || '123456',     // 密码（改成你本地 MySQL 的密码）
  {
    host: process.env.DB_HOST || '127.0.0.1',
    dialect: 'mysql',
    logging: false, // 嫌终端日志太多可以关闭，想看原生 SQL 可以改成 console.log
    timezone: '+08:00', // 设置东八区时间
  }
);

export default sequelize;