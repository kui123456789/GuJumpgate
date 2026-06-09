const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/steps/pix-redeem.js');

const pixModule = globalThis.MultiPageBackgroundPixRedeem;

function createJsonResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name = '') {
        return String(name || '').toLowerCase() === 'content-type' ? 'application/json' : '';
      },
    },
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function createTextResponse(status, body = '', contentType = 'text/plain') {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name = '') {
        return String(name || '').toLowerCase() === 'content-type' ? contentType : '';
      },
    },
    async text() {
      return body;
    },
  };
}

function createHarness(overrides = {}) {
  let state = {
    pixRedeemApiBaseUrl: 'https://pix.example/',
    pixRedeemExternalApiKey: 'external-secret',
    pixRedeemClientId: 'client-test-001',
    pixRedeemCdkeyPoolText: 'CDK-USED\nCDK-001\nCDK-002',
    pixRedeemCdkeyUsage: {
      'CDK-USED': { usedAt: 1690000000000, lastAttemptAt: 1690000000000, lastError: '' },
    },
    plusCheckoutTabId: 123,
    ...(overrides.state || {}),
  };
  const calls = {
    fetch: [],
    setState: [],
    complete: [],
    logs: [],
    messages: [],
  };
  const tab = overrides.tab || { id: 123, url: 'https://chatgpt.com/' };
  const chrome = overrides.chrome || {
    tabs: {
      get: async () => tab,
      query: async () => [tab],
      update: async () => tab,
    },
  };
  const executor = pixModule.createPixRedeemExecutor({
    chrome,
    now: () => 1700000000000,
    getState: async () => state,
    setState: async (patch) => {
      calls.setState.push(patch);
      state = { ...state, ...(patch || {}) };
    },
    completeNodeFromBackground: async (nodeId, payload) => {
      calls.complete.push({ nodeId, payload });
    },
    addLog: async (message, level, options) => {
      calls.logs.push({ message, level, options });
    },
    getTabId: async () => 123,
    isTabAlive: async () => true,
    registerTab: async () => {},
    waitForTabCompleteUntilStopped: overrides.waitForTabCompleteUntilStopped || (async () => {}),
    ensureContentScriptReadyOnTabUntilStopped: overrides.ensureContentScriptReadyOnTabUntilStopped || (async () => {}),
    sendTabMessageUntilStopped: async (tabId, source, message) => {
      calls.messages.push({ tabId, source, message });
      return overrides.sessionResult || { accessToken: 'access-token-001' };
    },
    fetchImpl: async (url, options) => {
      calls.fetch.push({ url, options });
      if (typeof overrides.fetchImpl === 'function') {
        return overrides.fetchImpl(url, options);
      }
      if (String(url).endsWith('/api/external/access-token/check')) {
        return createJsonResponse(200, {
          success: true,
          data: {
            items: [{ cdkey: 'CDK-001', token_ok: true, eligible: true }],
          },
        });
      }
      return createJsonResponse(200, { success: true });
    },
  });

  return {
    calls,
    executor,
    getState: () => state,
  };
}

test('pix redeem posts the first unused cdkey with the current access token', async () => {
  const harness = createHarness();

  await harness.executor.executePixRedeem({ nodeId: 'pix-redeem', visibleStep: 6 });

  assert.equal(harness.calls.fetch.length, 2);
  assert.equal(harness.calls.fetch[0].url, 'https://pix.example/api/external/access-token/check');
  assert.equal(harness.calls.fetch[0].options.method, 'POST');
  assert.equal(harness.calls.fetch[0].options.headers['X-Client-Id'], 'client-test-001');
  assert.deepEqual(JSON.parse(harness.calls.fetch[0].options.body), {
    items: [{ cdkey: 'CDK-001', access_token: 'access-token-001' }],
  });
  assert.equal(harness.calls.fetch[1].url, 'https://pix.example/api/external/cdkey-redeems');
  assert.equal(harness.calls.fetch[1].options.method, 'POST');
  assert.equal(harness.calls.fetch[1].options.headers['X-External-Api-Key'], 'external-secret');
  assert.equal(harness.calls.fetch[1].options.headers['X-Client-Id'], 'client-test-001');
  assert.equal(harness.calls.fetch[1].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(harness.calls.fetch[1].options.body), {
    items: [{ cdkey: 'CDK-001', access_token: 'access-token-001' }],
  });
  assert.equal(harness.calls.messages[0].message.payload.includeAccessToken, true);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt, 1700000000000);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastAttemptAt, 1700000000000);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, '');
  assert.deepEqual(harness.calls.complete, [{
    nodeId: 'pix-redeem',
    payload: { cdkey: 'CDK-001' },
  }]);
});

test('pix redeem falls back to /api/auth/session when the checkout content script is not ready', async () => {
  const chrome = {
    tabs: {
      get: async () => ({ id: 123, url: 'https://chatgpt.com/' }),
      query: async () => [{ id: 123, url: 'https://chatgpt.com/' }],
      update: async () => ({ id: 123, url: 'https://chatgpt.com/' }),
    },
    scripting: {
      executeScript: async () => [{
        result: {
          ok: true,
          status: 200,
          session: { accessToken: 'script-access-token' },
          accessToken: 'script-access-token',
        },
      }],
    },
  };
  const harness = createHarness({
    chrome,
    ensureContentScriptReadyOnTabUntilStopped: async () => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    },
  });

  await harness.executor.executePixRedeem({ nodeId: 'pix-redeem', visibleStep: 6 });

  assert.deepEqual(JSON.parse(harness.calls.fetch[0].options.body), {
    items: [{ cdkey: 'CDK-001', access_token: 'script-access-token' }],
  });
  assert.deepEqual(JSON.parse(harness.calls.fetch[1].options.body), {
    items: [{ cdkey: 'CDK-001', access_token: 'script-access-token' }],
  });
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt, 1700000000000);
});

test('pix redeem skips disabled cdkeys and uses the first enabled unused cdkey', async () => {
  const harness = createHarness({
    state: {
      pixRedeemCdkeyPoolText: 'CDK-USED\nCDK-DISABLED\nCDK-001',
      pixRedeemCdkeyUsage: {
        'CDK-USED': { usedAt: 1690000000000, lastAttemptAt: 1690000000000, lastError: '', enabled: true },
        'CDK-DISABLED': { usedAt: 0, lastAttemptAt: 0, lastError: '', enabled: false },
      },
    },
  });

  await harness.executor.executePixRedeem({ nodeId: 'pix-redeem', visibleStep: 6 });

  assert.deepEqual(JSON.parse(harness.calls.fetch[1].options.body), {
    items: [{ cdkey: 'CDK-001', access_token: 'access-token-001' }],
  });
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-DISABLED'].usedAt || 0, 0);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-DISABLED'].enabled, false);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].enabled, true);
});

test('pix redeem validates required config, cdkey, and access token', async () => {
  await assert.rejects(
    createHarness({ state: { pixRedeemApiBaseUrl: '' } }).executor.executePixRedeem({ visibleStep: 6 }),
    /Pix API Base URL.*未配置/
  );
  await assert.rejects(
    createHarness({ state: { pixRedeemExternalApiKey: '' } }).executor.executePixRedeem({ visibleStep: 6 }),
    /Pix External API Key.*未配置/
  );
  await assert.rejects(
    createHarness({ state: { pixRedeemCdkeyPoolText: 'CDK-USED' } }).executor.executePixRedeem({ visibleStep: 6 }),
    /没有可用的 Pix 卡密/
  );
  await assert.rejects(
    createHarness({
      state: {
        pixRedeemCdkeyPoolText: 'CDK-DISABLED',
        pixRedeemCdkeyUsage: {
          'CDK-DISABLED': { usedAt: 0, lastAttemptAt: 0, lastError: '', enabled: false },
        },
      },
    }).executor.executePixRedeem({ visibleStep: 6 }),
    /没有可用的 Pix 卡密/
  );
  await assert.rejects(
    createHarness({ sessionResult: { accessToken: '' } }).executor.executePixRedeem({ visibleStep: 6 }),
    /accessToken/
  );
});

test('pix redeem does not mark cdkey used when redeem request fails', async () => {
  for (const status of [400, 500]) {
    const harness = createHarness({
      fetchImpl: async (url) => {
        if (String(url).endsWith('/api/external/access-token/check')) {
          return createJsonResponse(200, {
            success: true,
            data: { items: [{ cdkey: 'CDK-001', token_ok: true, eligible: true }] },
          });
        }
        return createJsonResponse(status, { error: `HTTP ${status}` });
      },
    });

    await assert.rejects(
      harness.executor.executePixRedeem({ visibleStep: 6 }),
      new RegExp(String(status))
    );
    assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt || 0, 0);
    assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastAttemptAt, 1700000000000);
    assert.match(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, new RegExp(String(status)));
  }
});

test('pix redeem checks access token eligibility before posting redeem', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/external/access-token/check')) {
        return createJsonResponse(200, {
          success: true,
          data: {
            items: [{
              cdkey: 'CDK-001',
              token_ok: true,
              eligible: false,
              message: '账号无资格',
            }],
          },
        });
      }
      return createJsonResponse(200, { success: true });
    },
  });

  await assert.rejects(
    harness.executor.executePixRedeem({ visibleStep: 6 }),
    /账号无资格/
  );
  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.calls.fetch[0].url, 'https://pix.example/api/external/access-token/check');
  assert.equal(harness.calls.fetch[0].options.headers['X-Client-Id'], 'client-test-001');
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt || 0, 0);
  assert.match(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, /账号无资格/);
});

test('pix redeem does not mark cdkey used when redeem payload item failed', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/external/access-token/check')) {
        return createJsonResponse(200, {
          success: true,
          data: { items: [{ cdkey: 'CDK-001', token_ok: true, eligible: true }] },
        });
      }
      return createJsonResponse(200, {
        success: true,
        data: {
          items: [{
            cdkey: 'CDK-001',
            status: 'failed',
            message: 'CDK 不存在',
          }],
        },
      });
    },
  });

  await assert.rejects(
    harness.executor.executePixRedeem({ visibleStep: 6 }),
    /CDK 不存在/
  );
  assert.equal(harness.calls.fetch.length, 2);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt || 0, 0);
  assert.match(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, /CDK 不存在/);
});

test('pix redeem rejects 2xx html responses as a wrong endpoint instead of marking used', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/external/access-token/check')) {
        return createJsonResponse(200, {
          success: true,
          data: { items: [{ cdkey: 'CDK-001', token_ok: true, eligible: true }] },
        });
      }
      return createTextResponse(200, '<!doctype html><html><body>app</body></html>', 'text/html');
    },
  });

  await assert.rejects(
    harness.executor.executePixRedeem({ visibleStep: 6 }),
    /返回了 HTML|API Base URL|路由/
  );
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt || 0, 0);
  assert.match(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, /HTML|Base URL|路由/);
});

test('pix redeem does not mark cdkey used on network errors', async () => {
  const harness = createHarness({
    fetchImpl: async (url) => {
      if (String(url).endsWith('/api/external/access-token/check')) {
        return createJsonResponse(200, {
          success: true,
          data: { items: [{ cdkey: 'CDK-001', token_ok: true, eligible: true }] },
        });
      }
      throw new Error('fetch failed');
    },
  });

  await assert.rejects(
    harness.executor.executePixRedeem({ visibleStep: 6 }),
    /fetch failed/
  );
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt || 0, 0);
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastAttemptAt, 1700000000000);
  assert.match(harness.getState().pixRedeemCdkeyUsage['CDK-001'].lastError, /fetch failed/);
});
