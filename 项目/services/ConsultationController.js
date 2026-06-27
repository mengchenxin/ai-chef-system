const DiagnosisAgent = require('../agents/DiagnosisAgent');
const PrescriptionAgent = require('../agents/PrescriptionAgent');
const ConsultationRecord = require('../models/ConsultationRecord');

class ConsultationController {
  constructor() {
    this.agents = new Map();
  }

  getOrCreateAgent(sessionId) {
    if (!this.agents.has(sessionId)) {
      this.agents.set(sessionId, {
        diagnosisAgent: new DiagnosisAgent(),
        prescriptionAgent: new PrescriptionAgent(),
        status: 'diagnosing',
        sessionId: sessionId,
        userId: null,
        createdAt: new Date()
      });
    }
    return this.agents.get(sessionId);
  }

  async processMessage(sessionId, userMessage, userId = null) {
    const agentData = this.getOrCreateAgent(sessionId);
    
    if (userId) {
      agentData.userId = userId;
    }

    if (agentData.status === 'diagnosing') {
      const diagnosisResult = await agentData.diagnosisAgent.processMessage(userMessage);
      
      await this.saveConsultationRecord(sessionId, userId, 'user', userMessage);
      await this.saveConsultationRecord(sessionId, userId, 'assistant', diagnosisResult.response);

      if (diagnosisResult.isComplete) {
        agentData.status = 'prescribing';
        
        const dialogHistory = agentData.diagnosisAgent.getDialogHistory();
        const prescription = await agentData.prescriptionAgent.generatePrescription(
          diagnosisResult.diagnosisResult,
          dialogHistory
        );

        await this.saveConsultationRecord(
          sessionId, 
          userId, 
          'assistant', 
          this.formatPrescription(prescription)
        );

        agentData.status = 'completed';

        return {
          type: 'prescription',
          message: this.formatPrescription(prescription),
          diagnosisResult: diagnosisResult.diagnosisResult,
          prescription: prescription,
          status: 'completed'
        };
      }

      return {
        type: 'diagnosis',
        message: diagnosisResult.response,
        diagnosisResult: diagnosisResult.diagnosisResult,
        status: 'diagnosing'
      };
    }

    return {
      type: 'info',
      message: '问诊已完成，如需重新问诊请开始新的会话',
      status: agentData.status
    };
  }

  async saveConsultationRecord(sessionId, userId, role, content) {
    try {
      await ConsultationRecord.create({
        session_id: sessionId,
        user_id: userId,
        role: role,
        content: content,
        prescription: role === 'assistant' && content.includes('【方剂名称】') ? content : null
      });
    } catch (error) {
      console.error('保存问诊记录失败:', error);
    }
  }

  formatPrescription(prescription) {
    let formatted = `【方剂名称】\n${prescription.formulaName || '未命名'}\n\n`;
    
    formatted += '【组成】\n';
    prescription.composition.forEach(item => {
      formatted += `${item.herb} ${item.dosage}\n`;
    });
    
    if (prescription.efficacy) {
      formatted += `\n【功效】\n${prescription.efficacy}\n`;
    }
    
    if (prescription.indication) {
      formatted += `\n【主治】\n${prescription.indication}\n`;
    }
    
    if (prescription.explanation) {
      formatted += `\n【方解】\n${prescription.explanation}\n`;
    }
    
    if (prescription.usage) {
      formatted += `\n【用法用量】\n${prescription.usage}\n`;
    }
    
    if (prescription.precautions) {
      formatted += `\n【注意事项】\n${prescription.precautions}\n`;
    }
    
    if (prescription.referenceFormulas && prescription.referenceFormulas.length > 0) {
      formatted += `\n【参考经典方剂】\n`;
      prescription.referenceFormulas.forEach((formula, index) => {
        formatted += `${index + 1}. ${formula.formulaName} - 出自《${formula.book}》\n`;
      });
    }
    
    return formatted;
  }

  async getSessionHistory(sessionId) {
    return await ConsultationRecord.findBySessionId(sessionId);
  }

  async getAgentStatus(sessionId) {
    const agentData = this.agents.get(sessionId);
    if (!agentData) {
      return { status: 'not_found' };
    }
    return {
      status: agentData.status,
      sessionId: agentData.sessionId,
      userId: agentData.userId,
      createdAt: agentData.createdAt
    };
  }

  clearSession(sessionId) {
    this.agents.delete(sessionId);
  }

  cleanupExpiredSessions(maxAgeHours = 24) {
    const now = new Date();
    for (const [sessionId, agentData] of this.agents) {
      const ageHours = (now - agentData.createdAt) / (1000 * 60 * 60);
      if (ageHours > maxAgeHours) {
        this.agents.delete(sessionId);
      }
    }
  }
}

module.exports = new ConsultationController();
