const axios = require('axios');
const axiosRetry = require('axios-retry');
const proxyManager = require('./proxyManager');

// Headers mặc định
const DEFAULT_HEADERS = {
  'sec-ch-ua-platform': '"Windows"',
  'Referer': 'https://app.venta.vn/',
  'Accept-Language': 'vi-VN,vi;q=0.9,fr-FR;q=0.8,fr;q=0.7,en-US;q=0.6,en;q=0.5',
  'sec-ch-ua': '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'X-Requested-With': 'XMLHttpRequest',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/javascript, */*; q=0.01'
};

/**
 * Tạo axios instance với hoặc không có proxy
 */
function createAxiosInstance(proxy = null) {
  const config = {
    timeout: 30000,
    headers: DEFAULT_HEADERS
  };
  
  // Thêm proxy nếu có
  if (proxy) {
    config.proxy = proxyManager.formatForAxios(proxy);
  }
  
  const instance = axios.create(config);
  
  // Cấu hình retry
  axiosRetry(instance, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
             error.response?.status === 429 ||
             (error.response?.status >= 500 && error.response?.status < 600);
    },
    onRetry: (retryCount, error, requestConfig) => {
      console.log(`🔄 Retry attempt ${retryCount} for ${requestConfig.url}`);
    }
  });
  
  return instance;
}

// Instance mặc định (không proxy)
const axiosInstance = createAxiosInstance();

// Cấu hình retry strategy
axiosRetry(axiosInstance, {
  retries: 3, // Số lần retry
  retryDelay: (retryCount) => {
    // Exponential backoff: 1s, 2s, 4s
    return retryCount * 1000;
  },
  retryCondition: (error) => {
    // Retry khi:
    // - Network error
    // - Timeout
    // - 5xx server errors
    // - 429 (rate limit)
    return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
           error.response?.status === 429 ||
           (error.response?.status >= 500 && error.response?.status < 600);
  },
  onRetry: (retryCount, error, requestConfig) => {
    console.log(`🔄 Retry attempt ${retryCount} for ${requestConfig.url}`);
  }
});

/**
 * Validate TikTok URL
 */
function isValidTikTokUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return url.includes('tiktok.com') || url.includes('vt.tiktok.com');
}

/**
 * Lấy thông tin 1 video với proxy (nếu có)
 * Trả thẳng response từ TikWM, chỉ xử lý 2 case đặc biệt
 */
async function getVideoInfo(url, useProxy = true) {
  try {
    // Lấy proxy nếu cần
    let proxy = null;
    let axiosClient = axiosInstance;
    
    if (useProxy) {
      proxy = proxyManager.getNext();
      if (proxy) {
        await proxyManager.waitIfNeeded(proxy.url);
        axiosClient = createAxiosInstance(proxy);
        console.log(`📥 Fetching with proxy ${proxy.url}: ${url}`);
      } else {
        console.log(`📥 Fetching without proxy: ${url}`);
      }
    } else {
      console.log(`📥 Fetching without proxy: ${url}`);
    }
    
    const response = await axiosClient.post(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
    );
    
    const data = response.data;
    
    // Case 1: Rate limit - retry sau 1s
    if (data.code === -1 && data.msg === 'Free Api Limit: 1 request/second.') {
      console.log(`⏳ Rate limit, waiting 1s and retry: ${url}`);
      await sleep(1000);
      // Retry
      const retryResponse = await axiosClient.post(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
      );
      return retryResponse.data;
    }
    
    // Case 2: URL parsing failed - trả 404
    if (data.code === -1 && data.msg && data.msg.includes('Url parsing is failed')) {
      console.log(`❌ Invalid URL: ${url}`);
      return {
        code: -1,
        msg: 'Please check url',
        url: url
      };
    }
    
    // Còn lại: trả thẳng response từ TikWM
    console.log(`✅ Success: ${url}`);
    return data;
    
  } catch (error) {
    console.error(`❌ Error fetching ${url}:`, error.message);
    
    // Network error hoặc timeout
    return {
      code: -1,
      msg: error.message || 'Network error',
      url: url
    };
  }
}
  // Validate URL
  if (!isValidTikTokUrl(url)) {
    throw new TikWMError('Invalid TikTok URL', 400, {
      message: 'URL must contain "tiktok.com"',
      url: url
    });
  }
  
  try {
    console.log(`📥 Fetching video info: ${url}`);
    
    const response = await axiosInstance.post(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
    );
    
    const result = processResponse(response, url);
    console.log(`✅ Success: ${url}`);
    
    return result;
  } catch (error) {
    // Nếu đã là TikWMError thì throw luôn
    if (error instanceof TikWMError) {
      throw error;
    }
    
    // Xử lý các lỗi khác
    console.error(`❌ Error fetching ${url}:`, error.message);
    
    if (error.code === 'ECONNABORTED') {
      throw new TikWMError('Request timeout', 408, {
        message: 'Request took too long to complete',
        url: url
      });
    }
    
    if (error.response) {
      throw new TikWMError('API request failed', error.response.status, {
        message: error.response.data?.msg || error.message,
        url: url
      });
    }
    
    throw new TikWMError('Network error', 503, {
      message: error.message,
      url: url
    });
  }

/**
 * Lấy thông tin nhiều videos với proxy pool
 */
async function getMultipleVideosInfo(urls) {
  const results = [];
  const totalProxies = proxyManager.getActiveCount();
  const batchSize = totalProxies + 1; // +1 cho connection không proxy
  
  console.log(`📦 Processing ${urls.length} URLs with ${batchSize} concurrent connections (1 direct + ${totalProxies} proxies)`);
  
  // Xử lý theo batch
  for (let i = 0; i < urls.length; i += batchSize) {
    const batch = urls.slice(i, i + batchSize);
    console.log(`📦 Processing batch ${Math.floor(i / batchSize) + 1}: ${batch.length} URLs`);
    
    // Gọi parallel cho mỗi batch
    const batchPromises = batch.map(async (url) => {
      const data = await getVideoInfo(url, true);
      return {
        url: url,
        ...data
      };
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Nếu còn batch tiếp theo, đợi 1s
    if (i + batchSize < urls.length) {
      console.log('⏳ Waiting 1s before next batch...');
      await sleep(1000);
    }
  }
  
  const successful = results.filter(r => r.code === 0).length;
  console.log(`✅ Completed: ${successful}/${urls.length} successful`);
  
  return results;
}

/**
 * Helper function: sleep
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getVideoInfo,
  getMultipleVideosInfo,
  createAxiosInstance
};
