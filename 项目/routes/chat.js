const express = require('express');
const router = express.Router();
const consultationController = require('../services/ConsultationController');

router.post('/message', async (req, res) => {
  try {
    const { sessionId, message, userId } = req.body;
    
    if (!sessionId || !message) {
      return res.status(400).json({ error: 'sessionId 和 message 是必填字段' });
    }

    const result = await consultationController.processMessage(sessionId, message, userId);
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = await consultationController.getSessionHistory(sessionId);
    res.json(history);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const status = await consultationController.getAgentStatus(sessionId);
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    consultationController.clearSession(sessionId);
    res.json({ message: '会话已清除' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
