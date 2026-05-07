const test = require('node:test');
const assert = require('node:assert/strict');

const proxyManager = require('../src/services/proxyManager');
const tikwmService = require('../src/services/tikwmService');

test.afterEach(() => {
  proxyManager.clear();
});

test('buildRequestPlan uses one direct lane plus enabled proxy lanes', () => {
  proxyManager.clear();
  proxyManager.add('10.0.0.1:8000:user:pass');
  proxyManager.add('10.0.0.2:9000');
  proxyManager.toggle(1);

  const plan = tikwmService.buildRequestPlan(['u1', 'u2', 'u3', 'u4']);

  assert.equal(plan.batchSize, 2);
  assert.deepEqual(plan.batches.map((batch) => batch.map((item) => ({
    url: item.url,
    proxyKey: item.proxyKey
  }))), [
    [
      { url: 'u1', proxyKey: null },
      { url: 'u2', proxyKey: '10.0.0.1:8000:user:pass' }
    ],
    [
      { url: 'u3', proxyKey: null },
      { url: 'u4', proxyKey: '10.0.0.1:8000:user:pass' }
    ]
  ]);
});

test('processUrlBatches runs each batch in parallel and waits only between batches', async () => {
  const calls = [];
  const waits = [];
  const lanes = [
    { proxy: null, proxyKey: null },
    { proxy: { host: '10.0.0.1', port: '8000' }, proxyKey: '10.0.0.1:8000' }
  ];

  const results = await tikwmService.processUrlBatches(['u1', 'u2', 'u3'], {
    lanes,
    delayMs: 1000,
    wait: async (ms) => {
      waits.push(ms);
    },
    fetchVideo: async ({ url, proxyKey }) => {
      calls.push({ url, proxyKey });
      return { code: 0, data: { id: url } };
    }
  });

  assert.deepEqual(calls, [
    { url: 'u1', proxyKey: null },
    { url: 'u2', proxyKey: '10.0.0.1:8000' },
    { url: 'u3', proxyKey: null }
  ]);
  assert.deepEqual(waits, [1000]);
  assert.deepEqual(results, [
    { url: 'u1', code: 0, data: { id: 'u1' }, status: 'success' },
    { url: 'u2', code: 0, data: { id: 'u2' }, status: 'success' },
    { url: 'u3', code: 0, data: { id: 'u3' }, status: 'success' }
  ]);
});

test('formatForAxios treats IP:PORT proxies as HTTP proxies', () => {
  const proxy = proxyManager.add('160.250.182.61:15136:f95u:f95u');

  assert.deepEqual(proxyManager.formatForAxios(proxy), {
    protocol: 'http',
    host: '160.250.182.61',
    port: 15136,
    auth: {
      username: 'f95u',
      password: 'f95u'
    }
  });
});

test('buildAxiosConfig tunnels HTTPS requests through HTTP proxies', () => {
  const proxy = proxyManager.add('160.250.182.61:15136:f95u:f95u');
  const config = tikwmService.buildAxiosConfig(proxy, {
    createProxyAgent: (proxyUrl) => ({ proxyUrl })
  });

  assert.equal(config.proxy, false);
  assert.deepEqual(config.httpsAgent, {
    proxyUrl: 'http://f95u:f95u@160.250.182.61:15136'
  });
});

test('buildAxiosConfig uses 3s timeout for proxy lanes', () => {
  const proxy = proxyManager.add('160.250.182.61:15136:f95u:f95u');
  const proxyConfig = tikwmService.buildAxiosConfig(proxy, {
    createProxyAgent: (proxyUrl) => ({ proxyUrl })
  });
  const directConfig = tikwmService.buildAxiosConfig();

  assert.equal(proxyConfig.timeout, 3000);
  assert.equal(directConfig.timeout, 30000);
});

test('processUrlBatches marks remaining URLs pending when deadline is reached', async () => {
  let currentTime = 0;
  const lanes = [
    { proxy: null, proxyKey: null },
    { proxy: { host: '10.0.0.1', port: '8000' }, proxyKey: '10.0.0.1:8000' }
  ];

  const results = await tikwmService.processUrlBatches(['u1', 'u2', 'u3', 'u4'], {
    lanes,
    maxWaitMs: 1000,
    delayMs: 1000,
    now: () => currentTime,
    wait: async (ms) => {
      currentTime += ms;
    },
    fetchVideo: async ({ url }) => ({ code: 0, data: { id: url } })
  });

  assert.deepEqual(results, [
    { url: 'u1', code: 0, data: { id: 'u1' }, status: 'success' },
    { url: 'u2', code: 0, data: { id: 'u2' }, status: 'success' },
    { url: 'u3', code: -2, msg: 'Not processed before deadline', status: 'pending' },
    { url: 'u4', code: -2, msg: 'Not processed before deadline', status: 'pending' }
  ]);
});

test('processUrlBatches converts thrown lane errors into failed URL results', async () => {
  const results = await tikwmService.processUrlBatches(['u1'], {
    maxWaitMs: 1000,
    wait: async () => {},
    fetchVideo: async () => {
      throw new Error('proxy exploded');
    }
  });

  assert.deepEqual(results, [
    { url: 'u1', code: -1, msg: 'proxy exploded', status: 'failed' }
  ]);
});

test('summarizeResults counts success failed and pending URLs', () => {
  const summary = tikwmService.summarizeResults([
    { status: 'success' },
    { status: 'failed' },
    { status: 'pending' }
  ]);

  assert.deepEqual(summary, {
    completed: 1,
    failed: 1,
    pending: 1
  });
});

test('normalizeMaxWaitMs defaults and clamps to Vercel Hobby max duration', () => {
  assert.equal(tikwmService.normalizeMaxWaitMs(undefined), 300000);
  assert.equal(tikwmService.normalizeMaxWaitMs(999999), 300000);
});

test('getServiceBatchOptions owns the default deadline', () => {
  assert.deepEqual(tikwmService.getServiceBatchOptions(), {
    maxWaitMs: 300000
  });
});
