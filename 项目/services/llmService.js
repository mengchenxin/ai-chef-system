const OpenAI = require('openai');
const config = require('../config/index');

const openai = new OpenAI({
  apiKey: config.llm.apiKey,
  baseURL: config.llm.baseUrl,
});

async function askDeepSeek(messages, options = {}) {
  try {
    const response = await openai.chat.completions.create({
      model: options.model || config.llm.model,
      messages: messages,
      max_tokens: options.maxTokens || config.llm.maxTokens,
      temperature: options.temperature || config.llm.temperature,
    });

    if (response.choices && response.choices.length > 0) {
      return response.choices[0].message.content.trim();
    }

    throw new Error('未获取到模型响应');
  } catch (error) {
    console.error('\x1b[31m', '❌ DeepSeek API 调用失败:', error.message);
    if (error.response) {
      console.error('\x1b[31m', '错误详情:', JSON.stringify(error.response.data, null, 2));
    }
    throw error;
  }
}

async function askDeepSeekReasoner(messages, options = {}) {
  return await askDeepSeek(messages, {
    ...options,
    model: config.llm.modelReasoner
  });
}

async function askDeepSeekJSON(messages, options = {}) {
  const response = await askDeepSeek(messages, options);
  try {
    return JSON.parse(response);
  } catch (parseError) {
    console.error('\x1b[31m', '❌ JSON 解析失败:', parseError.message);
    console.error('\x1b[33m', '原始响应:', response);
    throw new Error('模型返回格式不是有效的 JSON');
  }
}

module.exports = {
  askDeepSeek,
  askDeepSeekReasoner,
  askDeepSeekJSON
};
