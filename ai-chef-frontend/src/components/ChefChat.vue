<script setup>
import { ref } from 'vue';


const prompt = ref('');
const displayText = ref("");  // 用于接收 AI 返回的纯文本
const isGenerating = ref(false);

const startCooking = async () => {
  // if (!prompt.value.trim()) return;
  
  console.log("🚀 按钮被点击了！");
  console.log("📝 当前输入框的内容是:", prompt.value);
  
  if (!prompt.value.trim()) {
      console.warn("⚠️ 检测到输入为空，阻止了请求！");
      return; 
  }
  
  isGenerating.value = true;
  displayText.value = ""; 
  console.log("⏳ 准备发送 fetch 请求给后端...");

  isGenerating.value = true;
  displayText.value = ""; // 每次请求前清空屏幕

  try {
    const response = await fetch('http://localhost:3000/api/chef/cook/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.value })
    });

    if (!response.ok) throw new Error("网络响应不正常");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      console.log("📦 收到后端数据块:", chunk); // 核心监控：看看前端到底收到了啥
      
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (line.trim().startsWith('data: ')) {
          try {
            // 提取 data: 后面的 JSON 字符串
            const jsonStr = line.replace(/^data:\s*/, '');
            const event = JSON.parse(jsonStr);
            
            if (event.text) {
              // 将收到的文本追加到屏幕上
              displayText.value += event.text; 
            }
          } catch (e) {
            console.error("❌ JSON 解析失败:", e, "原始字符串:", line);
          }
        }
      }
    }
  } catch (err) {
    console.error("请求报错:", err);
    displayText.value = "⚠️ 生成失败，请检查后端服务是否开启。";
  } finally {
    isGenerating.value = false;
  }
};
</script>

<template>
  <div class="chat-container">
    <div class="header">
      <h2>🍳 AI 私厨定制中心</h2>
    </div>

    <textarea v-model="prompt" placeholder="例如：查询三文鱼营养..." rows="3"></textarea>
    <button @click="startCooking" :disabled="isGenerating">
      {{ isGenerating ? '大厨正在构思食谱...' : '开始定制菜谱' }}
    </button>

    <div v-if="displayText" class="recipe-card">
      <div class="card-header">
        <h3 class="section-title">👨‍🍳 厨师的回复</h3>
      </div>
      
      <div class="content-box">
        {{ displayText }}
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container { max-width: 650px; margin: 40px auto; padding: 20px; font-family: 'Segoe UI', sans-serif; }
textarea { width: 100%; padding: 15px; margin-bottom: 15px; border-radius: 8px; border: 1px solid #ccc; box-sizing: border-box; font-size: 16px;}
button { width: 100%; padding: 12px; cursor: pointer; background: #42b983; color: white; border: none; border-radius: 8px; font-size: 16px; font-weight: bold; transition: background 0.3s;}
button:disabled { background: #94d3b6; cursor: not-allowed; }
.recipe-card { border: 1px solid #e1e4e8; padding: 25px; border-radius: 12px; margin-top: 25px; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #eee; padding-bottom: 10px; margin-bottom: 15px;}
.section-title { border-left: 4px solid #42b983; padding-left: 10px; margin: 0; }
.content-box { white-space: pre-wrap; line-height: 1.8; color: #333; font-size: 15px; }
</style>