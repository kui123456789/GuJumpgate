const assert = require('node:assert/strict');
const test = require('node:test');

require('../background/verification-flow.js');

function createHelpers(deps = {}) {
  let currentState = deps.state || {
    email: 'alias@example.com',
    customEmailPoolEntries: [{
      email: 'alias@example.com',
      verificationUrl: 'https://example.test/code',
      enabled: true,
      used: false,
    }],
  };
  const statePatches = [];
  const completions = [];
  const fillMessages = [];

  const helpers = globalThis.MultiPageBackgroundVerificationFlow.createVerificationFlowHelpers({
    addLog: async () => {},
    chrome: {
      tabs: {
        update: async () => {},
      },
    },
    completeNodeFromBackground: async (nodeId, payload) => {
      completions.push({ nodeId, payload });
    },
    fetch: deps.fetchImpl || (async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        data: {
          message: 'Your OpenAI verification code is 654321.',
        },
      }),
    })),
    getNodeIdByStepForState: (step) => (step === 4 ? 'fetch-signup-code' : 'fetch-login-code'),
    getState: async () => currentState,
    getTabId: async () => 123,
    sendToContentScript: async (_target, message) => {
      fillMessages.push(message);
      return { success: true, url: 'https://auth.openai.com/authorize' };
    },
    sendToContentScriptResilient: async (_target, message) => {
      fillMessages.push(message);
      return { success: true, url: 'https://chatgpt.com/' };
    },
    setState: async (patch) => {
      statePatches.push(patch);
      currentState = {
        ...currentState,
        ...patch,
      };
    },
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    VERIFICATION_POLL_MAX_ROUNDS: 1,
    ...deps,
  });

  return {
    helpers,
    completions,
    fillMessages,
    getState: () => currentState,
    statePatches,
  };
}

test('custom email URL verifier extracts codes from text and nested JSON', () => {
  const { helpers } = createHelpers();

  assert.equal(
    helpers.__test.extractCustomEmailVerificationCode('Your ChatGPT verification code is 123456.'),
    '123456'
  );
  assert.equal(
    helpers.__test.extractCustomEmailVerificationCode({
      data: {
        order_id: '999999',
        message: 'OpenAI verification code: 234567',
      },
    }),
    '234567'
  );
  assert.equal(
    helpers.__test.extractCustomEmailVerificationCode({
      code: '3 4 5 6 7 8',
    }),
    '345678'
  );
});

test('custom email URL verifier fetches code and submits signup verification', async () => {
  const requestedUrls = [];
  const { helpers, completions, fillMessages, getState } = createHelpers({
    fetchImpl: async (url, options = {}) => {
      requestedUrls.push({ url, options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({
          data: {
            message: 'Your OpenAI verification code is 654321.',
          },
        }),
      };
    },
  });

  const result = await helpers.resolveCustomEmailVerificationStep(4, getState(), {
    signupProfile: {
      firstName: 'Ada',
      lastName: 'Lovelace',
      year: 1995,
      month: 6,
      day: 9,
    },
  });

  assert.equal(result.handled, true);
  assert.equal(result.code, '654321');
  assert.equal(requestedUrls[0].url, 'https://example.test/code');
  assert.equal(requestedUrls[0].options.method, 'GET');
  assert.equal(fillMessages.length, 1);
  assert.equal(fillMessages[0].type, 'FILL_CODE');
  assert.equal(fillMessages[0].payload.code, '654321');
  assert.equal(getState().lastSignupCode, '654321');
  assert.equal(completions.length, 1);
  assert.equal(completions[0].nodeId, 'fetch-signup-code');
  assert.equal(completions[0].payload.code, '654321');
});

test('custom email URL verifier returns unhandled when current email has no URL', async () => {
  const { helpers } = createHelpers({
    state: {
      email: 'plain@example.com',
      customEmailPoolEntries: [{
        email: 'plain@example.com',
        credential: 'plain@example.com----secret-token',
      }],
    },
  });

  const result = await helpers.resolveCustomEmailVerificationStep(4, {
    email: 'plain@example.com',
    customEmailPoolEntries: [{
      email: 'plain@example.com',
      credential: 'plain@example.com----secret-token',
    }],
  });

  assert.equal(result.handled, false);
});

test('custom email URL verifier does not mark pool entry used on HTTP failure', async () => {
  const state = {
    email: 'alias@example.com',
    customEmailPoolEntries: [{
      email: 'alias@example.com',
      verificationUrl: 'https://example.test/code',
      used: false,
      enabled: true,
    }],
  };
  const { helpers, getState } = createHelpers({
    state,
    fetchImpl: async () => ({
      ok: false,
      status: 500,
      text: async () => 'server error',
    }),
  });

  await assert.rejects(
    () => helpers.resolveCustomEmailVerificationStep(4, state),
    /HTTP 500/
  );
  assert.equal(getState().customEmailPoolEntries[0].used, false);
});
