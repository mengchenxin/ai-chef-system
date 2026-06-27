const { askDeepSeek } = require('../services/llmService');
const medicalRetriever = require('../services/medicalRetriever');

const PRESCRIPTION_SYSTEM_PROMPT = `
你是一位专业的中医处方智能体，精通中药方剂配伍理论。

## 职责：
1. 根据诊断结果生成合适的中药方剂
2. 确保方剂配伍符合中医理论
3. 提供详细的用药指导

## 重要原则：
1. 必须参考提供的中医经典方剂
2. 如无经典参考，需说明理由
3. 处方必须符合经方规范
4. 药物剂量必须安全合理

## 输入：
你将收到诊断智能体的诊断结果，包括：
- 病因分析
- 辨证结果
- 病机分析
- 检索到的中医经典方剂参考

## 输出要求：
请输出完整的中药处方，格式如下：

【方剂名称】
请给出方剂名称（如：桂枝汤、麻黄汤等）

【组成】
列出组成方剂的各味药材及用量
格式：药名1 用量（单位：克）
      药名2 用量（单位：克）
      ...

【功效】
方剂的主要功效

【主治】
该方剂适用的病症

【方解】
方剂的配伍分析和药理说明，必须说明参考了哪些经典方剂

【用法用量】
服用方法和剂量说明

【注意事项】
禁忌、不良反应及注意事项

## 注意事项：
1. 方剂必须符合中医理论和配伍原则
2. 用药剂量要合理、安全
3. 对于不确定的情况，应谨慎处理并建议咨询专业医师
4. 必须包含方解部分，解释配伍原理
5. 优先使用经典方剂，如对经典方进行加减，需说明理由
`;

class PrescriptionAgent {
  constructor() {
    this.prescription = null;
    this.referenceFormulas = [];
  }

  async generatePrescription(diagnosisResult, dialogHistory = []) {
    const diagnosisSummary = `
病因分析：${diagnosisResult.etiologicalAnalysis || diagnosisResult.rawContent}

辨证结果：${diagnosisResult.syndromeDifferentiation || '未明确'}

病机分析：${diagnosisResult.pathogenesisAnalysis || '未明确'}
    `.trim();

    const queryForRetrieval = this.buildRetrievalQuery(diagnosisResult, dialogHistory);
    const relevantFormulas = medicalRetriever.retrieveRelevantFormulas(queryForRetrieval, 3);
    this.referenceFormulas = relevantFormulas;
    const referenceContext = medicalRetriever.formatRetrievedContext(relevantFormulas);

    const messages = [
      { role: 'system', content: PRESCRIPTION_SYSTEM_PROMPT },
      { role: 'user', content: `请根据以下诊断结果生成中药方剂：\n\n${diagnosisSummary}${referenceContext}` }
    ];

    const response = await askDeepSeek(messages);

    this.prescription = this.parsePrescription(response);
    this.prescription.rawResponse = response;
    this.prescription.referenceFormulas = relevantFormulas;

    return this.prescription;
  }

  buildRetrievalQuery(diagnosisResult, dialogHistory) {
    let query = '';
    
    if (diagnosisResult.syndromeDifferentiation) {
      query += diagnosisResult.syndromeDifferentiation + ' ';
    }
    if (diagnosisResult.etiologicalAnalysis) {
      query += diagnosisResult.etiologicalAnalysis + ' ';
    }
    if (diagnosisResult.pathogenesisAnalysis) {
      query += diagnosisResult.pathogenesisAnalysis + ' ';
    }
    
    for (const msg of dialogHistory) {
      if (msg.role === 'user') {
        query += msg.content + ' ';
      }
    }
    
    return query.trim();
  }

  parsePrescription(response) {
    const result = {
      formulaName: '',
      composition: [],
      efficacy: '',
      indication: '',
      explanation: '',
      usage: '',
      precautions: '',
      referenceFormulas: [],
      rawResponse: response
    };

    const sections = response.split('【');
    
    for (const section of sections) {
      if (!section.trim()) continue;
      
      const [header, content] = section.split('】');
      if (!header || !content) continue;

      const trimmedHeader = header.trim();
      const trimmedContent = content.trim().replace(/【.*】/g, '').trim();

      switch (trimmedHeader) {
        case '方剂名称':
          result.formulaName = trimmedContent;
          break;
        case '组成':
          result.composition = trimmedContent.split('\n').map(line => {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) {
              return {
                herb: parts[0],
                dosage: parts.slice(1).join(' ')
              };
            }
            return { herb: line.trim(), dosage: '' };
          }).filter(item => item.herb);
          break;
        case '功效':
          result.efficacy = trimmedContent;
          break;
        case '主治':
          result.indication = trimmedContent;
          break;
        case '方解':
          result.explanation = trimmedContent;
          break;
        case '用法用量':
          result.usage = trimmedContent;
          break;
        case '注意事项':
          result.precautions = trimmedContent;
          break;
      }
    }

    return result;
  }

  getPrescription() {
    return this.prescription;
  }

  reset() {
    this.prescription = null;
    this.referenceFormulas = [];
  }
}

module.exports = PrescriptionAgent;
