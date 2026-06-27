const express = require('express');
const router = express.Router();
const ConsultationRecord = require('../models/ConsultationRecord');

router.post('/', async (req, res) => {
  try {
    const recordId = await ConsultationRecord.create(req.body);
    res.status(201).json({ id: recordId, message: '问诊记录创建成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const records = await ConsultationRecord.findAll();
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/session/:sessionId', async (req, res) => {
  try {
    const records = await ConsultationRecord.findBySessionId(req.params.sessionId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/user/:userId', async (req, res) => {
  try {
    const records = await ConsultationRecord.findByUserId(req.params.userId);
    res.json(records);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const record = await ConsultationRecord.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ message: '记录不存在' });
    }
    res.json(record);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const success = await ConsultationRecord.update(req.params.id, req.body);
    if (!success) {
      return res.status(404).json({ message: '记录不存在' });
    }
    res.json({ message: '记录更新成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const success = await ConsultationRecord.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ message: '记录不存在' });
    }
    res.json({ message: '记录删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/session/:sessionId', async (req, res) => {
  try {
    const success = await ConsultationRecord.deleteBySessionId(req.params.sessionId);
    if (!success) {
      return res.status(404).json({ message: '会话不存在' });
    }
    res.json({ message: '会话记录删除成功' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
