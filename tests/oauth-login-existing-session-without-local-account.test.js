const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');

function loadStep7Module() {
  const source = fs.readFileSync(path.join(rootDir, 'background', 'steps', 'oauth-login.js'), 'utf8');
  const sandbox = {};
  vm.runInNewContext(source, sandbox, {
    filename: 'background/steps/oauth-login.js',
  });
  return sandbox.MultiPageBackgroundStep7;
}

test('oauth login allows existing browser auth session without local account identifier', async () => {
  const step7Module = loadStep7Module();
  const openedUrls = [];
  const completed = [];
  const executor = step7Module.createStep7Executor({
    addLog: async () => {},
    completeNodeFromBackground: async (nodeId, payload) => {
      completed.push({ nodeId, payload });
    },
    getErrorMessage: (error) => error?.message || String(error),
    getLoginAuthStateLabel: (state) => state || '',
    getOAuthFlowStepTimeoutMs: async (fallback) => fallback,
    getState: async () => ({
      nodeId: 'oauth-login',
      visibleStep: 7,
      email: '',
      accountIdentifier: '',
      accountIdentifierType: '',
      registrationEmailState: { current: '' },
    }),
    getTabId: () => null,
    isStep6RecoverableResult: () => false,
    isStep6SuccessResult: (result) => result?.success === true,
    refreshOAuthUrlBeforeStep6: async () => 'https://auth.openai.com/oauth/authorize?client_id=test',
    reuseOrCreateTab: async (source, url) => {
      openedUrls.push({ source, url });
    },
    sendToContentScriptResilient: async () => ({
      success: true,
      state: 'oauth_consent_page',
      directOAuthConsentPage: true,
    }),
    startOAuthFlowTimeoutWindow: async () => {},
    STEP6_MAX_ATTEMPTS: 2,
    throwIfStopped: () => {},
  });

  await executor.executeStep7({});

  assert.equal(openedUrls.length, 1);
  assert.equal(completed.length, 1);
  assert.equal(completed[0].nodeId, 'oauth-login');
  assert.equal(completed[0].payload.skipLoginVerificationStep, true);
  assert.equal(completed[0].payload.directOAuthConsentPage, true);
});

test('content oauth login checks current auth page before requiring an identifier', () => {
  const source = fs.readFileSync(path.join(rootDir, 'content', 'signup-page.js'), 'utf8');
  const step6LoginIndex = source.indexOf('async function step6_login(payload)');
  const snapshotIndex = source.indexOf('waitForKnownLoginAuthState(15000)', step6LoginIndex);
  const missingAccountCallIndex = source.indexOf('throwMissingLoginIdentifier();', snapshotIndex);

  assert.ok(step6LoginIndex > 0);
  assert.ok(snapshotIndex > step6LoginIndex);
  assert.ok(missingAccountCallIndex > snapshotIndex);
  assert.equal(source.includes("if (!email && !phoneNumber) throw new Error('登录时缺少邮箱地址或手机号。');"), false);
});
