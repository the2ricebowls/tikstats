const axios = require('axios');
const axiosRetry = require('axios-retry');
const { HttpsProxyAgent } = require('https-proxy-agent');
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
const PROXY_TIMEOUT_MS = 3000;
const DIRECT_TIMEOUT_MS = 30000;
const DEFAULT_MAX_WAIT_MS = 300000;
const MAX_MAX_WAIT_MS = 300000;
const MIN_MAX_WAIT_MS = 1000;

let singleRequestLaneIndex = 0;
let lastDirectRequestTime = 0;

function createProxyUrl(proxy) {
  const auth = proxy.username && proxy.password
    ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
    : '';

  return `http://${auth}${proxy.host}:${proxy.port}`;
}

function buildAxiosConfig(proxy = null, options = {}) {
  const config = {
    timeout: options.timeoutMs || (proxy ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS),
    headers: DEFAULT_HEADERS
  };

  if (options.signal) {
    config.signal = options.signal;
  }

  if (proxy) {
    const createProxyAgent = options.createProxyAgent || ((proxyUrl) => new HttpsProxyAgent(proxyUrl));
    config.proxy = false;
    config.httpsAgent = createProxyAgent(createProxyUrl(proxy));
  }

  return config;
}

function createAxiosInstance(proxy = null, options = {}) {
  const config = buildAxiosConfig(proxy, options);
  const instance = axios.create(config);

  axiosRetry(instance, {
    retries: options.retries === undefined ? (proxy ? 0 : 3) : options.retries,
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
      lane: null,
      timeoutMs: undefined,
      signal: undefined
    };
  }

  const hasLane = Object.prototype.hasOwnProperty.call(options, 'proxy') ||
    Object.prototype.hasOwnProperty.call(options, 'proxyKey');

  return {
    useProxy: options.useProxy !== false,
    lane: hasLane
      ? { proxy: options.proxy || null, proxyKey: options.proxyKey || null }
      : null,
    timeoutMs: options.timeoutMs,
    signal: options.signal
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
    const timeoutMs = requestOptions.timeoutMs || (proxy ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS);

    await waitForLane(proxyKey);

    if (proxy) {
      axiosClient = createAxiosInstance(proxy, {
        timeoutMs,
        signal: requestOptions.signal
      });
      console.log(`Fetching with proxy ${proxyKey}: ${url}`);
    } else if (requestOptions.timeoutMs || requestOptions.signal) {
      axiosClient = createAxiosInstance(null, {
        timeoutMs,
        signal: requestOptions.signal
      });
      console.log(`Fetching without proxy: ${url}`);
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

function normalizeMaxWaitMs(maxWaitMs) {
  const parsed = Number(maxWaitMs);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_MAX_WAIT_MS;
  }

  return Math.min(MAX_MAX_WAIT_MS, Math.max(MIN_MAX_WAIT_MS, parsed));
}

function getServiceBatchOptions() {
  return {
    maxWaitMs: DEFAULT_MAX_WAIT_MS
  };
}

function createPendingResult(item, msg = 'Not processed before deadline') {
  return {
    url: item.url,
    code: -2,
    msg,
    status: 'pending'
  };
}

function createFailedResult(item, error) {
  return {
    url: item.url,
    code: -1,
    msg: error.message || 'Network error',
    status: 'failed'
  };
}

function normalizeVideoResult(item, data) {
  const result = {
    ...data,
    url: item.url
  };

  if (!result.status) {
    result.status = result.code === 0 ? 'success' : 'failed';
  }

  return result;
}

function summarizeResults(results) {
  return results.reduce((summary, result) => {
    if (result.status === 'success') {
      summary.completed++;
    } else if (result.status === 'pending') {
      summary.pending++;
    } else {
      summary.failed++;
    }

    return summary;
  }, {
    completed: 0,
    failed: 0,
    pending: 0
  });
}

function flattenRemainingBatches(batches, startIndex) {
  return batches.slice(startIndex).flat();
}

async function fetchWithDeadline(item, fetchVideo, remainingMs) {
  if (remainingMs <= 0) {
    return createPendingResult(item);
  }

  const timeoutMs = item.proxy ? PROXY_TIMEOUT_MS : DIRECT_TIMEOUT_MS;
  const controller = new AbortController();
  let deadlineTimer;

  const fetchPromise = Promise.resolve()
    .then(() => fetchVideo({
      ...item,
      timeoutMs,
      signal: controller.signal
    }))
    .then((data) => normalizeVideoResult(item, data))
    .catch((error) => createFailedResult(item, error));

  const deadlinePromise = new Promise((resolve) => {
    deadlineTimer = setTimeout(() => {
      controller.abort();
      resolve(createPendingResult(item));
    }, remainingMs);
  });

  const result = await Promise.race([fetchPromise, deadlinePromise]);
  clearTimeout(deadlineTimer);
  return result;
}

async function processUrlBatches(urls, options = {}) {
  const results = [];
  const wait = options.wait || sleep;
  const delayMs = options.delayMs === undefined ? 0 : options.delayMs;
  const now = options.now || (() => Date.now());
  const startedAt = options.startedAt === undefined ? now() : options.startedAt;
  const maxWaitMs = normalizeMaxWaitMs(options.maxWaitMs);
  const fetchVideo = options.fetchVideo || ((item) => getVideoInfo(item.url, item));
  const plan = buildRequestPlan(urls, options.lanes);
  const getRemainingMs = () => maxWaitMs - (now() - startedAt);

  for (let i = 0; i < plan.batches.length; i++) {
    const batch = plan.batches[i];
    const remainingMs = getRemainingMs();

    if (remainingMs <= 0) {
      results.push(...flattenRemainingBatches(plan.batches, i).map((item) => createPendingResult(item)));
      break;
    }

    console.log(`Processing batch ${i + 1}: ${batch.length} URLs`);

    const batchResults = await Promise.all(
      batch.map((item) => fetchWithDeadline(item, fetchVideo, remainingMs))
    );

    results.push(...batchResults);

    if (delayMs > 0 && i < plan.batches.length - 1) {
      const remainingBeforeWait = getRemainingMs();
      const waitMs = Math.min(delayMs, Math.max(0, remainingBeforeWait));

      if (waitMs <= 0) {
        continue;
      }

      console.log('Waiting 1s before next batch...');
      await wait(waitMs);
    }
  }

  return results;
}

async function getMultipleVideosInfo(urls, options = getServiceBatchOptions()) {
  const totalProxies = proxyManager.getActiveCount();
  const batchSize = totalProxies + 1;
  const maxWaitMs = normalizeMaxWaitMs(options.maxWaitMs);

  console.log(`Processing ${urls.length} URLs with ${batchSize} concurrent connections (1 direct + ${totalProxies} proxies)`);

  const results = await processUrlBatches(urls, {
    ...options,
    maxWaitMs
  });
  const summary = summarizeResults(results);
  console.log(`Completed: ${summary.completed}/${urls.length} successful, ${summary.failed} failed, ${summary.pending} pending`);

  return {
    results,
    summary: {
      ...summary,
      batchSize,
      maxWaitMs
    }
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = {
  getVideoInfo,
  getMultipleVideosInfo,
  createAxiosInstance,
  buildAxiosConfig,
  createProxyUrl,
  normalizeMaxWaitMs,
  getServiceBatchOptions,
  summarizeResults,
  buildRequestLanes,
  buildRequestPlan,
  processUrlBatches
};
