// src/config/database.js
import { Sequelize } from 'sequelize';
import 'dotenv/config';

// 数据库配置一律从 .env 读，源码里不留任何默认凭据。
// 用 `k in process.env` 判断存在性，允许本地 root 使用空密码。
const REQUIRED = ['DB_NAME', 'DB_USER', 'DB_PASSWORD'];
const missing = REQUIRED.filter((k) => !(k in process.env));
if (missing.length) {
  throw new Error(
    `缺少数据库环境变量：${missing.join(', ')}。请复制 .env.example 为 .env 后填写。`
  );
}

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASSWORD,
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    dialect: 'mysql',
    logging: false, // 想看原生 SQL 可以改成 console.log
    timezone: '+08:00', // 东八区
    pool: { max: 10, min: 0, acquire: 30000, idle: 10000 },
  }
);

export default sequelize;
