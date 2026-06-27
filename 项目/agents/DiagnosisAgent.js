const { askDeepSeek } = require('../services/llmService');

const DIAGNOSIS_SYSTEM_PROMPT = `
你是一位专业的中医诊断智能体，精通中医理论和辨证论治。

## 职责：
1. 通过多轮对话收集用户的症状信息
2. 按照中医四诊（望、闻、问、切）的原则进行问诊
3. 分析用户描述的症状，进行辨证分析

## 问诊要点：
- 主要症状：哪里不舒服、持续时间、发作频率
- 伴随症状：是否有其他不适
- 舌象：舌苔颜色、厚薄、润燥
- 脉象：脉象特征
- 饮食睡眠：食欲、睡眠情况
- 大小便情况
- 既往病史

## 回答规则：
1. 只能回答中医诊断相关问题
2. 对于与中医诊断无关的问题，请礼貌地拒绝并说明原因
3. 使用专业但易懂的语言
4. 保持问诊的连贯性和逻辑性
5. 当收集到足够信息后，输出诊断总结并标记为[诊断完成]

## 格式要求：
- 正常问诊：直接输出问诊内容
- 诊断完成：以[诊断完成]开头，包含：
  - 病因分析
  - 辨证结果
  - 病机分析
`;

class DiagnosisAgent {
  constructor() {
    this.dialogHistory = [];
    this.isDiagnosisComplete = false;
    this.diagnosisResult = null;
  }

  async processMessage(userMessage) {
    this.dialogHistory.push({ role: 'user', content: userMessage });

    const messages = [
      { role: 'system', content: DIAGNOSIS_SYSTEM_PROMPT },
      ...this.dialogHistory
    ];

    const response = await askDeepSeek(messages);

    this.dialogHistory.push({ role: 'assistant', content: response });

    if (response.startsWith('[诊断完成]')) {
      this.isDiagnosisComplete = true;
      this.diagnosisResult = this.parseDiagnosisResult(response);
    }

    return {
      response: response.replace('[诊断完成]', '').trim(),
      isComplete: this.isDiagnosisComplete,
      diagnosisResult: this.diagnosisResult
    };
  }

  parseDiagnosisResult(response) {
    const content = response.replace('[诊断完成]', '').trim();
    const lines = content.split('\n');
    
    let result = {
      etiologicalAnalysis: '',
      syndromeDifferentiation: '',
      pathogenesisAnalysis: '',
      rawContent: content
    };

    let currentSection = '';
    for (const line of lines) {
      if (line.includes('病因分析')) {
        currentSection = 'etiologicalAnalysis';
        result.etiologicalAnalysis = line.replace('病因分析', '').trim();
      } else if (line.includes('辨证结果')) {
        currentSection = 'syndromeDifferentiation';
        result.syndromeDifferentiation = line.replace('辨证结果', '').trim();
      } else if (line.includes('病机分析')) {
        currentSection = 'pathogenesisAnalysis';
        result.pathogenesisAnalysis = line.replace('病机分析', '').trim();
      } else if (currentSection && line.trim()) {
        result[currentSection] += '\n' + line.trim();
      }
    }

    return result;
  }

  getDialogHistory() {
    return this.dialogHistory;
  }

  reset() {
    this.dialogHistory = [];
    this.isDiagnosisComplete = false;
    this.diagnosisResult = null;
  }
}

module.exports = DiagnosisAgent;
