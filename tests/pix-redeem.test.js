const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/steps/pix-redeem.js');

const pixModule = globalThis.MultiPageBackgroundPixRedeem;

function createJsonResponse(status, payload = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    },
    async text() {
      return JSON.stringify(payload);
    },
  };
}

function createHarness(overrides = {}) {
  let state = {
    pixRedeemApiBaseUrl: 'https://pix.example/',
    pixRedeemExternalApiKey: 'external-secret',
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
    addLog: async () => {},
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

  assert.equal(harness.calls.fetch.length, 1);
  assert.equal(harness.calls.fetch[0].url, 'https://pix.example/api/external/cdkey-redeems');
  assert.equal(harness.calls.fetch[0].options.method, 'POST');
  assert.equal(harness.calls.fetch[0].options.headers['X-External-Api-Key'], 'external-secret');
  assert.equal(harness.calls.fetch[0].options.headers['Content-Type'], 'application/json');
  assert.deepEqual(JSON.parse(harness.calls.fetch[0].options.body), {
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
  assert.equal(harness.getState().pixRedeemCdkeyUsage['CDK-001'].usedAt, 1700000000000);
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
    createHarness({ sessionResult: { accessToken: '' } }).executor.executePixRedeem({ visibleStep: 6 }),
    /accessToken/
  );
});

test('pix redeem does not mark cdkey used when redeem request fails', async () => {
  for (const status of [400, 500]) {
    const harness = createHarness({
      fetchImpl: async () => createJsonResponse(status, { error: `HTTP ${status}` }),
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

test('pix redeem does not mark cdkey used on network errors', async () => {
  const harness = createHarness({
    fetchImpl: async () => {
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
