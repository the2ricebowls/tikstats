const axios = require('axios');

/**
 * URL Pool Manager
 * Quản lý pool các worker servers và phân phối requests đều
 */
class PoolManager {
  constructor() {
    this.workers = [];
    this.currentIndex = 0;
    this.lastRequestTime = {};
    this.minDelay = 1000; // 1 giây giữa các requests cho mỗi worker
    
    this.loadWorkers();
  }
  
  /**
   * Load workers từ env
   */
  loadWorkers() {
    const urlPool = process.env.URL_POOL;
    
    if (!urlPool || urlPool.trim() === '') {
      console.log('⚠️  No URL_POOL configured, will call TikWM API directly');
      return;
    }
    
    this.workers = urlPool
      .split('|')
      .map(url => url.trim())
      .filter(url => url.length > 0);
    
    console.log(`✅ Loaded ${this.workers.length} workers:`, this.workers);
    
    // Initialize last request time
    this.workers.forEach(worker => {
      this.lastRequestTime[worker] = 0;
    });
  }
  
  /**
   * Kiểm tra có workers không
   */
  hasWorkers() {
    return this.workers.length > 0;
  }
  
  /**
   * Lấy worker tiếp theo (round-robin)
   */
  getNextWorker() {
    if (this.workers.length === 0) {
      return null;
    }
    
    const worker = this.workers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.workers.length;
    
    return worker;
  }
  
  /**
   * Đợi nếu cần để đảm bảo 1s delay cho worker
   */
  async waitIfNeeded(worker) {
    const now = Date.now();
    const lastTime = this.lastRequestTime[worker] || 0;
    const elapsed = now - lastTime;
    
    if (elapsed < this.minDelay) {
      const waitTime = this.minDelay - elapsed;
      console.log(`⏳ Waiting ${waitTime}ms for worker ${worker}`);
      await sleep(waitTime);
    }
    
    this.lastRequestTime[worker] = Date.now();
  }
  
  /**
   * Gọi worker để lấy video info
   */
  async callWorker(worker, url) {
    await this.waitIfNeeded(worker);
    
    console.log(`📡 Calling worker ${worker} for ${url}`);
    
    try {
      const response = await axios.get(`${worker}/api/video`, {
        params: { url },
        timeout: 35000 // 35s timeout
      });
      
      return response.data;
    } catch (error) {
      console.error(`❌ Worker ${worker} failed:`, error.message);
      throw error;
    }
  }
  
  /**
   * Xử lý nhiều URLs với pool
   */
  async processMultipleUrls(urls) {
    if (!this.hasWorkers()) {
      throw new Error('No workers available in pool');
    }
    
    console.log(`🚀 Processing ${urls.length} URLs with ${this.workers.length} workers`);
    
    const results = [];
    const batchSize = this.workers.length;
    
    // Xử lý theo batch (số lượng workers)
    for (let i = 0; i < urls.length; i += batchSize) {
      const batch = urls.slice(i, i + batchSize);
      console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} URLs`);
      
      // Gọi parallel cho mỗi batch
      const batchPromises = batch.map(async (url, index) => {
        const worker = this.workers[index % this.workers.length];
        
        try {
          const result = await this.callWorker(worker, url);
          return {
            success: true,
            url: url,
            data: result.data,
            worker: worker
          };
        } catch (error) {
          return {
            success: false,
            url: url,
            error: error.message,
            worker: worker
          };
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
      
      // Nếu còn batch tiếp theo, đợi 1s
      if (i + batchSize < urls.length) {
        console.log('⏳ Waiting 1s before next batch...');
        await sleep(1000);
      }
    }
    
    console.log(`✅ Completed: ${results.filter(r => r.success).length}/${urls.length} successful`);
    
    return results;
  }
}

/**
 * Helper: sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Singleton instance
const poolManager = new PoolManager();

module.exports = poolManager;
