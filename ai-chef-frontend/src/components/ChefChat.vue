<script setup>
import { ref } from 'vue';

const prompt = ref('');
const recipeData = ref(null);
const isGenerating = ref(false);
const startCooking = async () => {
  if (!prompt.value.trim()) return;
  isGenerating.value = true;
  recipeData.value = null;
  let fullText = ""; // 用来存储拼装后的 JSON 字符串

  try {
    const response = await fetch('http://localhost:3000/api/chef/cook/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: prompt.value })
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const jsonStr = line.replace('data: ', '');
          if (jsonStr === '[DONE]') continue;
          try {
            const parsed = JSON.parse(jsonStr);
            // 核心：把每个小片段里的 text 拼起来
            if (parsed.text) fullText += parsed.text;
          } catch (e) {}
        }
      }
    }
    // 流式结束后，把拼接好的完整 JSON 字符串转成对象
    recipeData.value = JSON.parse(fullText);
  } catch (err) {
    alert("生成失败，请检查后端服务！");
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

    <textarea v-model="prompt" placeholder="例如：我想吃清淡的健身晚餐..." rows="3"></textarea>
    <button @click="startCooking" :disabled="isGenerating">
      {{ isGenerating ? '大厨正在构思食谱...' : '开始定制菜谱' }}
    </button>

    <div v-if="recipeData" class="recipe-card">
      <div class="card-header">
        <h1>{{ recipeData.recipeName }}</h1>
        <span class="badge">{{ recipeData.difficulty }}</span>
      </div>
      
      <div class="meta-info">
        <span>⏱️ 准备时间: {{ recipeData.cookingTime }}</span>
      </div>

      <h3 class="section-title">🛒 精选食材</h3>
      <div class="ingredients-grid">
        <div v-for="item in recipeData.ingredients" :key="item.name" class="ingredient-tag">
          {{ item.name }} <span>{{ item.amount }}</span>
        </div>
      </div>

      <h3 class="section-title">👨‍🍳 烹饪步骤</h3>
      <ol class="steps-list">
        <li v-for="(step, index) in recipeData.steps" :key="index">{{ step }}</li>
      </ol>

      <div class="nutrition-tips">
        <p><strong>💡 营养小贴士：</strong> {{ recipeData.nutritionTips }}</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.chat-container { max-width: 650px; margin: 40px auto; padding: 20px; font-family: 'Segoe UI', sans-serif; }
textarea { width: 100%; padding: 10px; margin-bottom: 10px; border-radius: 4px; box-sizing: border-box; }
button { padding: 10px 20px; cursor: pointer; background: #42b983; color: white; border: none; border-radius: 4px; }
button:disabled { background: #ccc; }
.recipe-card { border: 1px solid #e1e4e8; padding: 25px; border-radius: 12px; margin-top: 25px; background: #ffffff; box-shadow: 0 4px 12px rgba(0,0,0,0.1); }
.card-header { display: flex; justify-content: space-between; align-items: center; }
.badge { background: #e1f5fe; color: #0288d1; padding: 4px 10px; border-radius: 15px; font-size: 0.8em; }
.ingredients-grid { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
.ingredient-tag { background: #f0f2f5; padding: 8px 12px; border-radius: 6px; font-size: 0.9em; }
.section-title { border-left: 4px solid #42b983; padding-left: 10px; margin: 20px 0 10px; }
.steps-list li { margin-bottom: 10px; line-height: 1.6; }
.nutrition-tips { background: #fffde7; padding: 15px; border-radius: 8px; margin-top: 20px; }
</style>