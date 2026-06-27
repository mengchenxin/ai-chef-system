const express = require('express');
const config = require('./config/index');
const medicalRetriever = require('./services/medicalRetriever');

const app = express();
const PORT = config.server.port;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/users', require('./routes/users'));
app.use('/api/consultations', require('./routes/consultation'));
app.use('/api/chat', require('./routes/chat'));

app.get('/', (req, res) => {
  res.json({ message: '中医问诊后端服务' });
});

app.listen(PORT, () => {
  console.log(`\x1b[32m`, `✅ 服务已启动，运行在端口 ${PORT}`);
});
