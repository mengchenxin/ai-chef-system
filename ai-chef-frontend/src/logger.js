// src/logger.js
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    // 将错误日志写入 error.log
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // 将所有日志写入 combined.log
    new winston.transports.File({ filename: 'logs/combined.log' }),
    // 同时在控制台打印
    new winston.transports.Console({ format: winston.format.simple() })
  ],
});

module.exports = logger;