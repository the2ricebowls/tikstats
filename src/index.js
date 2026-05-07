const express = require('express');
const path = require('path');
const tikwmService = require('./services/tikwmService');
const proxyManager = require('./services/proxyManager');
const proxyRoutes = require('./routes/proxyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

app.use('/api/proxies', proxyRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/video', async (req, res) => {
  const { url } = req.query;

  if (!url) {
    return res.status(400).json({
      code: -1,
      msg: 'URL parameter is required'
    });
  }

  const result = await tikwmService.getVideoInfo(url);

  if (result.code === -1 && result.msg === 'Please check url') {
    return res.status(404).json(result);
  }

  res.json(result);
});

app.post('/api/videos', async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({
      code: -1,
      msg: 'URLs array is required and must not be empty'
    });
  }

  const results = await tikwmService.getMultipleVideosInfo(urls);

  res.json({
    total: urls.length,
    data: results
  });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`TikWM Service running on port ${PORT}`);
  console.log(`Web UI: http://localhost:${PORT}/`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`GET single video: http://localhost:${PORT}/api/video?url=<tiktok_url>`);
  console.log(`POST multiple videos: http://localhost:${PORT}/api/videos`);

  const proxyCount = proxyManager.getActiveCount();
  if (proxyCount > 0) {
    console.log(`Proxy enabled: ${proxyCount} active proxies`);
    console.log(`Max throughput with proxies: ~${proxyCount + 1} requests/second`);
  } else {
    console.log('Tip: Add proxies via Web UI to increase throughput.');
  }
});

module.exports = app;
