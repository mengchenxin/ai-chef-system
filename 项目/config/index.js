require('dotenv').config();

const requiredEnvVars = [
  'LLM_API_KEY',
  'LLM_BASE_URL'
];

const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingVars.length > 0) {
  console.error('\x1b[31m', '❌ 缺少必要的环境变量:', missingVars.join(', '));
  console.error('\x1b[31m', '请检查 .env 文件是否正确配置');
  process.exit(1);
}

const config = {
  server: {
    port: parseInt(process.env.PORT) || 3000
  },
  
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'consultation_db'
  },
  
  llm: {
    apiKey: process.env.LLM_API_KEY,
    baseUrl: process.env.LLM_BASE_URL,
    model: process.env.LLM_MODEL || 'deepseek-chat',
    modelReasoner: process.env.LLM_MODEL_REASONER || 'deepseek-reasoner',
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS) || 4096,
    temperature: parseFloat(process.env.LLM_TEMPERATURE) || 0.7
  }
};

module.exports = config;
