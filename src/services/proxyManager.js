/**
 * Proxy Manager
 * Quản lý danh sách proxy và phân phối cho requests
 */

class ProxyManager {
  constructor() {
    this.proxies = [];
    this.currentIndex = 0;
    this.lastRequestTime = {};
    this.minDelay = 1000; // 1s
    
    this.loadProxies();
  }
  
  /**
   * Load proxies từ storage (in-memory)
   */
  loadProxies() {
    // Proxies sẽ được quản lý qua API, không load từ env
    console.log('📋 Proxy Manager initialized');
  }
  
  /**
   * Lấy tất cả proxies
   */
  getAll() {
    return this.proxies.map((p, index) => ({
      id: index,
      url: p.url,
      username: p.username || '',
      enabled: p.enabled !== false,
      lastUsed: this.lastRequestTime[p.url] || null
    }));
  }
  
  /**
   * Thêm proxy
   */
  add(proxyData) {
    const proxy = {
      url: proxyData.url,
      username: proxyData.username || '',
      password: proxyData.password || '',
      enabled: true
    };
    
    // Validate format
    if (!proxy.url || !proxy.url.startsWith('http')) {
      throw new Error('Invalid proxy URL format');
    }
    
    // Check duplicate
    if (this.proxies.some(p => p.url === proxy.url)) {
      throw new Error('Proxy already exists');
    }
    
    this.proxies.push(proxy);
    this.lastRequestTime[proxy.url] = 0;
    
    console.log(`✅ Added proxy: ${proxy.url}`);
    return proxy;
  }
  
  /**
   * Xóa proxy
   */
  remove(id) {
    if (id < 0 || id >= this.proxies.length) {
      throw new Error('Invalid proxy ID');
    }
    
    const proxy = this.proxies[id];
    delete this.lastRequestTime[proxy.url];
    this.proxies.splice(id, 1);
    
    console.log(`🗑️  Removed proxy: ${proxy.url}`);
  }
  
  /**
   * Toggle enable/disable
   */
  toggle(id) {
    if (id < 0 || id >= this.proxies.length) {
      throw new Error('Invalid proxy ID');
    }
    
    this.proxies[id].enabled = !this.proxies[id].enabled;
    console.log(`🔄 Toggled proxy ${id}: ${this.proxies[id].enabled ? 'enabled' : 'disabled'}`);
    
    return this.proxies[id].enabled;
  }
  
  /**
   * Lấy số lượng proxies active
   */
  getActiveCount() {
    return this.proxies.filter(p => p.enabled).length;
  }
  
  /**
   * Lấy proxy tiếp theo (round-robin, chỉ lấy enabled)
   */
  getNext() {
    const enabledProxies = this.proxies.filter(p => p.enabled);
    
    if (enabledProxies.length === 0) {
      return null;
    }
    
    const proxy = enabledProxies[this.currentIndex % enabledProxies.length];
    this.currentIndex++;
    
    return proxy;
  }
  
  /**
   * Đợi nếu cần để đảm bảo 1s delay
   */
  async waitIfNeeded(proxyUrl) {
    const now = Date.now();
    const lastTime = this.lastRequestTime[proxyUrl] || 0;
    const elapsed = now - lastTime;
    
    if (elapsed < this.minDelay) {
      const waitTime = this.minDelay - elapsed;
      await sleep(waitTime);
    }
    
    this.lastRequestTime[proxyUrl] = Date.now();
  }
  
  /**
   * Format proxy cho axios
   */
  formatForAxios(proxy) {
    if (!proxy) return null;
    
    const url = new URL(proxy.url);
    
    return {
      host: url.hostname,
      port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
      protocol: url.protocol.replace(':', ''),
      auth: proxy.username && proxy.password ? {
        username: proxy.username,
        password: proxy.password
      } : undefined
    };
  }
  
  /**
   * Clear tất cả proxies
   */
  clear() {
    this.proxies = [];
    this.lastRequestTime = {};
    this.currentIndex = 0;
    console.log('🗑️  Cleared all proxies');
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Singleton
const proxyManager = new ProxyManager();

module.exports = proxyManager;
