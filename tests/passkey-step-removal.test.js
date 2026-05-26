const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

require('../data/step-definitions.js');

const definitions = globalThis.MultiPageStepDefinitions;

function getSteps(options = {}) {
  return definitions.getSteps(options);
}

function getNodes(options = {}) {
  return definitions.getNodes(options);
}

function keysFor(options = {}) {
  return getSteps(options).map((step) => step.key);
}

function assertRegistrationPrefixHasNoPasskeyStep(options = {}) {
  const keys = keysFor(options);
  const signupCodeIndex = keys.indexOf('fetch-signup-code');
  const skipPasskeyIndex = keys.indexOf('skip-passkey-enrollment');
  const fillProfileIndex = keys.indexOf('fill-profile');

  assert.notEqual(signupCodeIndex, -1, 'flow should include fetch-signup-code');
  assert.equal(skipPasskeyIndex, -1, 'flow should not include skip-passkey-enrollment');
  assert.notEqual(fillProfileIndex, -1, 'flow should include fill-profile');
  assert.equal(fillProfileIndex, signupCodeIndex + 1, 'fill-profile should run immediately after signup code');

  const steps = getSteps(options);
  const fillProfile = steps[fillProfileIndex];
  assert.equal(fillProfile.id, 5, 'fill-profile should keep legacy step id 5');
  assert.equal(fillProfile.order, 50, 'fill-profile should keep legacy order 50');
}

test('openai registration flows go from signup code directly to profile', () => {
  [
    {},
    { signupMethod: 'phone' },
    { signupMethod: 'phone', phoneSignupReloginAfterBindEmailEnabled: true },
    { plusModeEnabled: true, plusPaymentMethod: 'paypal', plusHostedCheckoutIsFinalStep: false },
    { plusModeEnabled: true, plusPaymentMethod: 'paypal', plusHostedCheckoutIsFinalStep: true },
    { plusModeEnabled: true, plusPaymentMethod: 'gopay' },
    { plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' },
  ].forEach((options) => assertRegistrationPrefixHasNoPasskeyStep(options));
});

test('hosted checkout keeps plus checkout creation before OAuth after removing passkey step', () => {
  const keys = keysFor({
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusHostedCheckoutIsFinalStep: true,
  });

  assert.deepEqual(keys.slice(0, 7), [
    'open-chatgpt',
    'submit-signup-email',
    'fill-password',
    'fetch-signup-code',
    'fill-profile',
    'plus-checkout-create',
    'oauth-login',
  ]);
});

test('hosted checkout final flow has unique visible step ids after removing passkey step', () => {
  const steps = getSteps({
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusHostedCheckoutIsFinalStep: true,
  });
  const visibleIds = steps.map((step) => step.id);

  assert.equal(new Set(visibleIds).size, visibleIds.length);
  assert.equal(steps.find((step) => step.key === 'oauth-login')?.id, 7);
  assert.equal(steps.some((step) => step.key === 'plus-checkout-billing'), false);
});

test('workflow UI no longer exposes a step 4.5 passkey node', () => {
  const nodes = getNodes({});
  const passkeyNode = nodes.find((node) => node.nodeId === 'skip-passkey-enrollment');

  assert.equal(passkeyNode, undefined);
  assert.equal(nodes.some((node) => String(node.ui?.stepLabel || '') === '4.5'), false);
});

test('step 5 handles passkey enrollment page without requiring a separate 4.5 node', () => {
  const source = fs.readFileSync(path.join(rootDir, 'content', 'signup-page.js'), 'utf8');

  assert.doesNotMatch(source, /请先执行跳过通行密钥节点/);
  assert.match(source, /if\s*\(isPasskeyEnrollmentPage\(\)\)\s*{/);
  assert.match(source, /skipCreateAccountEnrollPasskey\(/);
  assert.match(source, /步骤 5：检测到通行密钥页，正在自动点击“跳过”/);
});

test('background no longer registers a dedicated passkey skip executor', () => {
  const background = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
  const fallback = fs.readFileSync(path.join(rootDir, 'background', 'verification-flow.js'), 'utf8');

  assert.doesNotMatch(background, /background\/steps\/skip-passkey-enrollment\.js/);
  assert.doesNotMatch(background, /skipPasskeyEnrollmentExecutor/);
  assert.doesNotMatch(background, /'skip-passkey-enrollment'\s*:\s*\(state\)\s*=>/);
  assert.match(fallback, /isPasskeyEnrollmentPageUrl/);
  assert.match(fallback, /passkey_enrollment/);
});
