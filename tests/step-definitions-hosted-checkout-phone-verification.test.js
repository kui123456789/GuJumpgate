const assert = require('node:assert/strict');
const test = require('node:test');

require('../data/step-definitions.js');

const definitions = globalThis.MultiPageStepDefinitions;

function getOpenAiSteps(options = {}) {
  return definitions.getSteps({
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusHostedCheckoutIsFinalStep: true,
    ...options,
  });
}

test('hosted checkout email OAuth tail runs phone verification before confirming OAuth', () => {
  const steps = getOpenAiSteps({ signupMethod: 'email' });
  const tail = steps.slice(6).map((step) => `${step.id}:${step.key}`);

  assert.deepEqual(tail, [
    '7:oauth-login',
    '8:fetch-login-code',
    '9:post-login-phone-verification',
    '10:confirm-oauth',
    '11:platform-verify',
  ]);
});

test('hosted checkout phone relogin OAuth tail runs post-bound phone verification before confirming OAuth', () => {
  const steps = getOpenAiSteps({
    signupMethod: 'phone',
    phoneSignupReloginAfterBindEmailEnabled: true,
  });
  const tail = steps.slice(6).map((step) => `${step.id}:${step.key}`);

  assert.deepEqual(tail, [
    '7:oauth-login',
    '8:fetch-login-code',
    '9:bind-email',
    '10:fetch-bind-email-code',
    '11:relogin-bound-email',
    '12:fetch-bound-email-login-code',
    '13:post-bound-email-phone-verification',
    '14:confirm-oauth',
    '15:platform-verify',
  ]);
});
