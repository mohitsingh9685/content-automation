const express = require('express');
const cors = require('cors');
const { env } = require('./config/env');
const { checkDbHealth } = require('./config/db');
const { apiRateLimiter } = require('./middlewares/rateLimiter');
const { notFoundHandler, errorHandler } = require('./middlewares/errorHandler');

const dashboardRoutes = require('./routes/dashboardRoutes');
const trendsRoutes = require('./routes/trendsRoutes');
const videosRoutes = require('./routes/videosRoutes');
const analyticsRoutes = require('./routes/analyticsRoutes');

const app = express();

app.use(
  cors({
    origin: [env.frontendUrl, 'http://localhost:5180', 'http://127.0.0.1:5180'],
    credentials: true,
  })
);
app.use(express.json({ limit: '4mb' }));
app.use('/storage', express.static(env.storageDir));
app.use('/assets', express.static(env.assetsDir));
app.use('/api', apiRateLimiter);

app.get('/api/health', async (req, res) => {
  const db = await checkDbHealth();
  res.status(db.healthy ? 200 : 503).json({
    success: db.healthy,
    service: 'hindi-trend-ai-backend',
    database: db,
  });
});

app.use('/api/dashboard', dashboardRoutes);
app.use('/api/trends', trendsRoutes);
app.use('/api/videos', videosRoutes);
app.use('/api/analytics', analyticsRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

module.exports = { app };
