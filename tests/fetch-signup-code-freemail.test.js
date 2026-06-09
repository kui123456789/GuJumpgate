const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

function loadStep4Module() {
  const filePath = path.join(__dirname, '..', 'background', 'steps', 'fetch-signup-code.js');
  const source = fs.readFileSync(filePath, 'utf8');
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.globalThis = sandbox;
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox, { filename: filePath });
  return sandbox.MultiPageBackgroundStep4;
}

test('signup code step treats freemail as API polling mail provider', async () => {
  const step4Module = loadStep4Module();
  const logs = [];
  const verificationCalls = [];
  let openedMailTab = false;

  const executor = step4Module.createStep4Executor({
    addLog: async (message) => {
      logs.push(String(message || ''));
    },
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeNodeFromBackground: async () => {},
    getMailConfig: () => ({
      provider: 'freemail',
      label: 'freemail',
    }),
    getTabId: async () => 123,
    HOTMAIL_PROVIDER: 'hotmail-api',
    ICLOUD_API_PROVIDER: 'icloud-api',
    isTabAlive: async () => false,
    LUCKMAIL_PROVIDER: 'luckmail-api',
    CLOUDFLARE_TEMP_EMAIL_PROVIDER: 'cloudflare-temp-email',
    CLOUD_MAIL_PROVIDER: 'cloudmail',
    FREEMAIL_PROVIDER: 'freemail',
    OUTLOOK_EMAIL_PLUS_PROVIDER: 'outlook-email-plus',
    resolveVerificationStep: async (_step, state, mail, options = {}) => {
      verificationCalls.push({ state, mail, options });
    },
    reuseOrCreateTab: async () => {
      openedMailTab = true;
    },
    shouldUseCustomRegistrationEmail: () => false,
    sendToContentScript: async () => ({
      alreadyVerified: false,
    }),
    resolveSignupMethod: () => 'email',
    throwIfStopped: () => {},
    waitForTabStableComplete: async () => {},
  });

  await executor.executeStep4({
    nodeId: 'fetch-signup-code',
    email: 'alias@example.com',
    registrationEmailState: { current: 'alias@example.com' },
    mailProvider: 'freemail',
    emailGenerator: 'freemail',
  });

  assert.equal(openedMailTab, false);
  assert.equal(verificationCalls.length, 1);
  assert.equal(verificationCalls[0].mail.provider, 'freemail');
  assert.equal(verificationCalls[0].options.requestFreshCodeFirst, false);
  assert.ok(logs.some((message) => message.includes('正在通过 freemail 轮询验证码')));
});

test('signup code step uses custom email verification URL before manual confirmation', async () => {
  const step4Module = loadStep4Module();
  const customCalls = [];
  let manualConfirmationCalled = false;

  const executor = step4Module.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeNodeFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {
      manualConfirmationCalled = true;
      throw new Error('manual confirmation should not be requested');
    },
    generateRandomBirthday: () => ({ year: 1995, month: 6, day: 9 }),
    generateRandomName: () => ({ firstName: 'Ada', lastName: 'Lovelace' }),
    getMailConfig: () => {
      throw new Error('mail config should not be required for custom URL verification');
    },
    getTabId: async () => 123,
    resolveCustomEmailVerificationStep: async (step, state, options = {}) => {
      customCalls.push({ step, state, options });
      return { handled: true, code: '654321' };
    },
    shouldUseCustomRegistrationEmail: () => true,
    sendToContentScript: async () => ({
      alreadyVerified: false,
    }),
    resolveSignupMethod: () => 'email',
    throwIfStopped: () => {},
    waitForTabStableComplete: async () => {},
  });

  await executor.executeStep4({
    nodeId: 'fetch-signup-code',
    email: 'alias@example.com',
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [{
      email: 'alias@example.com',
      verificationUrl: 'https://example.test/code',
    }],
  });

  assert.equal(manualConfirmationCalled, false);
  assert.equal(customCalls.length, 1);
  assert.equal(customCalls[0].step, 4);
  assert.equal(customCalls[0].state.email, 'alias@example.com');
  assert.equal(customCalls[0].options.signupProfile.firstName, 'Ada');
});

test('signup code step prefers custom pool verification URL before iCloud mail session', async () => {
  const step4Module = loadStep4Module();
  const customCalls = [];
  let mailConfigCalled = false;

  const executor = step4Module.createStep4Executor({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeNodeFromBackground: async () => {},
    confirmCustomVerificationStepBypass: async () => {
      throw new Error('manual confirmation should not be requested');
    },
    generateRandomBirthday: () => ({ year: 1995, month: 6, day: 9 }),
    generateRandomName: () => ({ firstName: 'Ada', lastName: 'Lovelace' }),
    getMailConfig: () => {
      mailConfigCalled = true;
      throw new Error('iCloud mail config should not be used when custom URL exists');
    },
    getTabId: async () => 123,
    resolveCustomEmailVerificationStep: async (step, state, options = {}) => {
      customCalls.push({ step, state, options });
      return { handled: true, code: '880419' };
    },
    shouldUseCustomRegistrationEmail: () => false,
    sendToContentScript: async () => ({
      alreadyVerified: false,
    }),
    resolveSignupMethod: () => 'email',
    throwIfStopped: () => {},
    waitForTabStableComplete: async () => {},
  });

  await executor.executeStep4({
    nodeId: 'fetch-signup-code',
    email: 'ulnar_peptide26+rsapmkzibnlzsfk72@icloud.com',
    mailProvider: 'icloud',
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [{
      email: 'ulnar_peptide26+rsapmkzibnlzsfk72@icloud.com',
      verificationUrl: 'http://icloudapi.xyz/show/key/ulnar_peptide26%2Brsapmkzibnlzsfk72@icloud.com',
    }],
  });

  assert.equal(mailConfigCalled, false);
  assert.equal(customCalls.length, 1);
  assert.equal(customCalls[0].step, 4);
  assert.equal(customCalls[0].state.email, 'ulnar_peptide26+rsapmkzibnlzsfk72@icloud.com');
});
