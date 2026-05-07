const express = require('express');
const proxyManager = require('../services/proxyManager');

const router = express.Router();

/**
 * GET /api/proxies - Lấy danh sách proxies
 */
router.get('/', (req, res) => {
  const proxies = proxyManager.getAll();
  res.json({
    success: true,
    count: proxies.length,
    active: proxyManager.getActiveCount(),
    proxies: proxies
  });
});

/**
 * POST /api/proxies - Thêm proxy mới
 * Body: { proxy: "IP:PORT:USER:PASS" hoặc "IP:PORT" }
 */
router.post('/', (req, res) => {
  try {
    const { proxy } = req.body;
    
    if (!proxy) {
      return res.status(400).json({
        success: false,
        error: 'Proxy string is required (format: IP:PORT:USER:PASS or IP:PORT)'
      });
    }
    
    const addedProxy = proxyManager.add(proxy);
    
    res.json({
      success: true,
      message: 'Proxy added successfully',
      proxy: {
        host: addedProxy.host,
        port: addedProxy.port,
        username: addedProxy.username || '',
        hasAuth: !!(addedProxy.username && addedProxy.password),
        enabled: addedProxy.enabled
      }
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/proxies/:id - Xóa proxy
 */
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    proxyManager.remove(id);
    
    res.json({
      success: true,
      message: 'Proxy removed successfully'
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * PATCH /api/proxies/:id/toggle - Toggle enable/disable
 */
router.patch('/:id/toggle', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const enabled = proxyManager.toggle(id);
    
    res.json({
      success: true,
      message: `Proxy ${enabled ? 'enabled' : 'disabled'}`,
      enabled: enabled
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * DELETE /api/proxies - Xóa tất cả proxies
 */
router.delete('/', (req, res) => {
  proxyManager.clear();
  res.json({
    success: true,
    message: 'All proxies cleared'
  });
});

module.exports = router;
