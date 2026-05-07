const axios = require('axios');
const axiosRetry = require('axios-retry');
const proxyManager = require('./proxyManager');

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

const DIRECT_DELAY_MS = 1000;

let singleRequestLaneIndex = 0;
let lastDirectRequestTime = 0;

function createAxiosInstance(proxy = null) {
  const config = {
    timeout: 30000,
    headers: DEFAULT_HEADERS
  };

  if (proxy) {
    config.proxy = proxyManager.formatForAxios(proxy);
  }

  const instance = axios.create(config);

  axiosRetry(instance, {
    retries: 3,
    retryDelay: (retryCount) => retryCount * 1000,
    retryCondition: (error) => {
      return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
        error.response?.status === 429 ||
        (error.response?.status >= 500 && error.response?.status < 600);
    },
    onRetry: (retryCount, error, requestConfig) => {
      console.log(`Retry attempt ${retryCount} for ${requestConfig.url}`);
    }
  });

  return instance;
}

const axiosInstance = createAxiosInstance();

function buildRequestLanes() {
  return [
    { proxy: null, proxyKey: null },
    ...proxyManager.getActive().map((proxy) => ({
      proxy,
      proxyKey: proxyManager.formatProxyString(proxy)
    }))
  ];
}

function buildRequestPlan(urls, lanes = buildRequestLanes()) {
  const activeLanes = lanes.length > 0 ? lanes : [{ proxy: null, proxyKey: null }];
  const batches = [];

  for (let i = 0; i < urls.length; i += activeLanes.length) {
    const batchUrls = urls.slice(i, i + activeLanes.length);
    batches.push(batchUrls.map((url, index) => ({
      url,
      proxy: activeLanes[index].proxy,
      proxyKey: activeLanes[index].proxyKey
    })));
  }

  return {
    batchSize: activeLanes.length,
    lanes: activeLanes,
    batches
  };
}

function getNextSingleRequestLane() {
  const lanes = buildRequestLanes();
  const lane = lanes[singleRequestLaneIndex % lanes.length];
  singleRequestLaneIndex++;
  return lane;
}

async function waitForDirectLane() {
  const now = Date.now();
  const elapsed = now - lastDirectRequestTime;

  if (elapsed < DIRECT_DELAY_MS) {
    await sleep(DIRECT_DELAY_MS - elapsed);
  }

  lastDirectRequestTime = Date.now();
}

async function waitForLane(proxyKey) {
  if (proxyKey) {
    await proxyManager.waitIfNeeded(proxyKey);
    return;
  }

  await waitForDirectLane();
}

function normalizeRequestOptions(options) {
  if (typeof options === 'boolean') {
    return {
      useProxy: options,
      lane: null
    };
  }

  const hasLane = Object.prototype.hasOwnProperty.call(options, 'proxy') ||
    Object.prototype.hasOwnProperty.call(options, 'proxyKey');

  return {
    useProxy: options.useProxy !== false,
    lane: hasLane
      ? { proxy: options.proxy || null, proxyKey: options.proxyKey || null }
      : null
  };
}

async function getVideoInfo(url, options = {}) {
  try {
    const requestOptions = normalizeRequestOptions(options);
    const lane = requestOptions.lane || (requestOptions.useProxy
      ? getNextSingleRequestLane()
      : { proxy: null, proxyKey: null });
    const { proxy, proxyKey } = lane;
    let axiosClient = axiosInstance;

    await waitForLane(proxyKey);

    if (proxy) {
      axiosClient = createAxiosInstance(proxy);
      console.log(`Fetching with proxy ${proxyKey}: ${url}`);
    } else {
      console.log(`Fetching without proxy: ${url}`);
    }

    const response = await axiosClient.post(
      `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
    );

    const data = response.data;

    if (data.code === -1 && data.msg === 'Free Api Limit: 1 request/second.') {
      console.log(`Rate limit, waiting 1s and retry: ${url}`);
      await sleep(1000);
      const retryResponse = await axiosClient.post(
        `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`
      );
      return retryResponse.data;
    }

    if (data.code === -1 && data.msg && data.msg.includes('Url parsing is failed')) {
      console.log(`Invalid URL: ${url}`);
      return {
        code: -1,
        msg: 'Please check url',
        url
      };
    }

    console.log(`Success: ${url}`);
    return data;
  } catch (error) {
    console.error(`Error fetching ${url}:`, error.message);

    return {
      code: -1,
      msg: error.message || 'Network error',
      url
    };
  }
}

async function processUrlBatches(urls, options = {}) {
  const results = [];
  const wait = options.wait || sleep;
  const delayMs = options.delayMs === undefined ? 1000 : options.delayMs;
  const fetchVideo = options.fetchVideo || ((item) => getVideoInfo(item.url, {
    proxy: item.proxy,
    proxyKey: item.proxyKey
  }));
  const plan = buildRequestPlan(urls, options.lanes);

  for (let i = 0; i < plan.batches.length; i++) {
    const batch = plan.batches[i];
    console.log(`Processing batch ${i + 1}: ${batch.length} URLs`);

    const batchResults = await Promise.all(batch.map(async (item) => {
      const data = await fetchVideo(item);
      return {
        url: item.url,
        ...data
      };
    }));

    results.push(...batchResults);

    if (i < plan.batches.length - 1) {
      console.log('Waiting 1s before next batch...');
      await wait(delayMs);
    }
  }

  return results;
}

async function getMultipleVideosInfo(urls) {
  const totalProxies = proxyManager.getActiveCount();
  const batchSize = totalProxies + 1;

  console.log(`Processing ${urls.length} URLs with ${batchSize} concurrent connections (1 direct + ${totalProxies} proxies)`);

  const results = await processUrlBatches(urls);
  const successful = results.filter(r => r.code === 0).length;
  console.log(`Completed: ${successful}/${urls.length} successful`);

  return results;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getVideoInfo,
  getMultipleVideosInfo,
  createAxiosInstance,
  buildRequestLanes,
  buildRequestPlan,
  processUrlBatches
};
