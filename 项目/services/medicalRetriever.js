const fs = require('fs');
const path = require('path');

const MEDICAL_DATA_PATH = path.join(__dirname, '../data/medicalClassics.json');

class MedicalRetriever {
  constructor() {
    this.formulas = [];
    this.loadData();
  }

  loadData() {
    try {
      const data = fs.readFileSync(MEDICAL_DATA_PATH, 'utf8');
      this.formulas = JSON.parse(data);
      console.log('\x1b[32m', '✅ 中医典籍数据加载成功，共', this.formulas.length, '个经方');
    } catch (error) {
      console.error('\x1b[31m', '❌ 加载中医典籍数据失败:', error.message);
    }
  }

  calculateMatchScore(formulaSymptoms, queryKeywords) {
    let score = 0;
    const formulaSymptomSet = new Set(formulaSymptoms.map(s => s.toLowerCase()));
    
    for (const keyword of queryKeywords) {
      const keywordLower = keyword.toLowerCase();
      if (formulaSymptomSet.has(keywordLower)) {
        score += 2;
      } else {
        for (const symptom of formulaSymptoms) {
          if (symptom.toLowerCase().includes(keywordLower) || keywordLower.includes(symptom.toLowerCase())) {
            score += 1;
            break;
          }
        }
      }
    }
    
    return score;
  }

  extractKeywords(query) {
    const keywords = [];
    const stopWords = ['的', '了', '在', '是', '我', '有', '和', '就', '不', '人', '都', '一', '个', '上', '也', '很', '像', '太', '好', '看', '说', '要', '去', '你', '我', '他', '她', '来', '这', '那', '有', '没', '会', '能', '想', '问', '题', '什', '么'];
    
    const words = query.split(/[，。！？、；：\u201c\u201d''（）【】\s]+/);
    
    for (const word of words) {
      if (word.length >= 2 && !stopWords.includes(word)) {
        keywords.push(word);
      }
    }
    
    return keywords;
  }

  retrieveRelevantFormulas(query, topK = 3) {
    const keywords = this.extractKeywords(query);
    
    if (keywords.length === 0) {
      return [];
    }

    const scoredFormulas = this.formulas.map(formula => {
      return {
        ...formula,
        score: this.calculateMatchScore(formula.symptoms, keywords)
      };
    });

    scoredFormulas.sort((a, b) => b.score - a.score);
    
    const relevantFormulas = scoredFormulas.filter(f => f.score > 0).slice(0, topK);
    
    console.log('\x1b[36m', `📚 检索到 ${relevantFormulas.length} 个相关经方`);
    relevantFormulas.forEach((formula, index) => {
      console.log(`   ${index + 1}. ${formula.formulaName} - 匹配度: ${formula.score}`);
    });
    
    return relevantFormulas;
  }

  formatRetrievedContext(formulas) {
    if (formulas.length === 0) {
      return '';
    }

    let context = '\n\n【参考中医经典参考】\n';
    context += '以下是根据患者症状从《伤寒杂病论》等典籍检索到的相关经典方剂：\n\n';
    
    formulas.forEach((formula, index) => {
      context += `【${index + 1}. ${formula.formulaName}】\n`;
      context += `■ 来源：${formula.book} · ${formula.chapter}\n`;
      context += `■ 主治：${formula.indication}\n`;
      context += `■ 功效：${formula.efficacy}\n`;
      context += `■ 组成：`;
      formula.composition.forEach((item, i) => {
        context += `${item.herb} ${item.dosage}${i < formula.composition.length - 1 ? '，' : ''}`;
      });
      context += '\n';
      context += `■ 症状：${formula.symptoms.join('、')}\n\n`;
    });

    context += '请参考以上经典方剂，结合患者具体症状，生成合适的处方。\n\n';
    return context;
  }
}

module.exports = new MedicalRetriever();
