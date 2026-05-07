const express = require('express');
const path = require('path');
const tikwmService = require('./services/tikwmService');
const poolManager = require('./services/poolService');
const proxyManager = require('./services/proxyManager');
const proxyRoutes = require('./routes/proxyRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api/proxies', proxyRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET: Lấy thông tin từ 1 URL
app.get('/api/video', async (req, res) => {
  const { url } = req.query;
  
  if (!url) {
    return res.status(400).json({
      code: -1,
      msg: 'URL parameter is required'
    });
  }

  const result = await tikwmService.getVideoInfo(url);
  
  // Nếu là URL parsing failed, trả 404
  if (result.code === -1 && result.msg === 'Please check url') {
    return res.status(404).json(result);
  }
  
  // Còn lại trả 200 với response từ TikWM
  res.json(result);
});

// POST: Xử lý nhiều URLs
app.post('/api/videos', async (req, res) => {
  const { urls } = req.body;
  
  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    return res.status(400).json({
      code: -1,
      msg: 'URLs array is required and must not be empty'
    });
  }

  let results;
  
  // Nếu có pool, dùng pool
  if (poolManager.hasWorkers()) {
    console.log(`🔄 Using pool with ${poolManager.workers.length} workers`);
    results = await poolManager.processMultipleUrls(urls);
  } else {
    // Không có pool, gọi trực tiếp
    console.log('📞 Calling TikWM API directly (no pool)');
    results = await tikwmService.getMultipleVideosInfo(urls);
  }
  
  res.json({
    total: urls.length,
    data: results
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 TikWM Service running on port ${PORT}`);
  console.log(`📍 Web UI: http://localhost:${PORT}/`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 GET single video: http://localhost:${PORT}/api/video?url=<tiktok_url>`);
  console.log(`📍 POST multiple videos: http://localhost:${PORT}/api/videos`);
  
  if (poolManager.hasWorkers()) {
    console.log(`\n🌐 URL Pool enabled with ${poolManager.workers.length} workers:`);
    poolManager.workers.forEach((worker, i) => {
      console.log(`   ${i + 1}. ${worker}`);
    });
    console.log(`⚡ Max throughput: ~${poolManager.workers.length} requests/second\n`);
  } else {
    console.log('\n⚠️  No URL_POOL configured - running in direct mode');
  }
  
  const proxyCount = proxyManager.getActiveCount();
  if (proxyCount > 0) {
    console.log(`\n🔐 Proxy enabled: ${proxyCount} active proxies`);
    console.log(`⚡ Max throughput with proxies: ~${proxyCount + 1} requests/second\n`);
  } else {
    console.log(`\n💡 Tip: Add proxies via Web UI to increase throughput!\n`);
  }
});
