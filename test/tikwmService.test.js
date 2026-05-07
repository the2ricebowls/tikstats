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
    { url: 'u1', code: 0, data: { id: 'u1' } },
    { url: 'u2', code: 0, data: { id: 'u2' } },
    { url: 'u3', code: 0, data: { id: 'u3' } }
  ]);
});
