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

function assertRegistrationPrefixIncludesPasskeySkip(options = {}) {
  const keys = keysFor(options);
  const signupCodeIndex = keys.indexOf('fetch-signup-code');
  const skipPasskeyIndex = keys.indexOf('skip-passkey-enrollment');
  const fillProfileIndex = keys.indexOf('fill-profile');

  assert.notEqual(signupCodeIndex, -1, 'flow should include fetch-signup-code');
  assert.notEqual(skipPasskeyIndex, -1, 'flow should include skip-passkey-enrollment');
  assert.notEqual(fillProfileIndex, -1, 'flow should include fill-profile');
  assert.equal(skipPasskeyIndex, signupCodeIndex + 1, 'skip-passkey-enrollment should run immediately after signup code');
  assert.equal(fillProfileIndex, skipPasskeyIndex + 1, 'fill-profile should remain immediately after passkey skip');

  const steps = getSteps(options);
  const skipStep = steps[skipPasskeyIndex];
  assert.equal(skipStep.id, 45);
  assert.equal(skipStep.order, 45);
  assert.equal(skipStep.sourceId, 'openai-auth');
  assert.equal(skipStep.driverId, 'content/signup-page');
  assert.equal(skipStep.command, 'skip-passkey-enrollment');
  assert.equal(skipStep.ui?.stepLabel, '4.5');

  const fillProfile = steps[fillProfileIndex];
  assert.equal(fillProfile.id, 5, 'fill-profile should keep legacy step id 5');
}

test('openai registration flows insert passkey skip between signup code and profile', () => {
  [
    {},
    { signupMethod: 'phone' },
    { signupMethod: 'phone', phoneSignupReloginAfterBindEmailEnabled: true },
    { plusModeEnabled: true, plusPaymentMethod: 'paypal', plusHostedCheckoutIsFinalStep: false },
    { plusModeEnabled: true, plusPaymentMethod: 'paypal', plusHostedCheckoutIsFinalStep: true },
    { plusModeEnabled: true, plusPaymentMethod: 'gopay' },
    { plusModeEnabled: true, plusPaymentMethod: 'gpc-helper' },
  ].forEach((options) => assertRegistrationPrefixIncludesPasskeySkip(options));
});

test('hosted checkout keeps plus checkout creation before OAuth after inserting passkey skip', () => {
  const keys = keysFor({
    plusModeEnabled: true,
    plusPaymentMethod: 'paypal',
    plusHostedCheckoutIsFinalStep: true,
  });

  assert.deepEqual(keys.slice(0, 8), [
    'open-chatgpt',
    'submit-signup-email',
    'fill-password',
    'fetch-signup-code',
    'skip-passkey-enrollment',
    'fill-profile',
    'plus-checkout-create',
    'oauth-login',
  ]);
});

test('passkey skip node is exposed to workflow UI as step label 4.5', () => {
  const nodes = getNodes({});
  const passkeyNode = nodes.find((node) => node.nodeId === 'skip-passkey-enrollment');

  assert.ok(passkeyNode, 'workflow nodes should include skip-passkey-enrollment');
  assert.equal(passkeyNode.legacyStepId, 45);
  assert.equal(passkeyNode.displayOrder, 45);
  assert.equal(passkeyNode.ui?.stepLabel, '4.5');
  assert.deepEqual(passkeyNode.next, ['fill-profile']);
});

test('signup content script contains passkey enrollment detection and skip handler', () => {
  const source = fs.readFileSync(path.join(rootDir, 'content', 'signup-page.js'), 'utf8');

  assert.match(source, /'skip-passkey-enrollment'\s*:\s*\(payload\)\s*=>\s*skipPasskeyEnrollmentStep\(payload\)/);
  assert.match(source, /create-account-enroll-passkey/);
  assert.match(source, /通行密钥/);
  assert.match(source, /passkey/i);
  assert.match(source, /跳过/);
  assert.match(source, /not\s*now/i);
  assert.match(source, /skip/i);
  assert.match(source, /请先执行跳过通行密钥节点/);
});

test('background registers passkey skip executor and fallback detection', () => {
  const background = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
  const fallback = fs.readFileSync(path.join(rootDir, 'background', 'verification-flow.js'), 'utf8');
  const executorPath = path.join(rootDir, 'background', 'steps', 'skip-passkey-enrollment.js');

  assert.ok(fs.existsSync(executorPath), 'background passkey skip executor should exist');
  assert.match(background, /background\/steps\/skip-passkey-enrollment\.js/);
  assert.match(background, /skipPasskeyEnrollmentExecutor/);
  assert.match(background, /'skip-passkey-enrollment'\s*:\s*\(state\)\s*=>\s*skipPasskeyEnrollmentExecutor\.executeSkipPasskeyEnrollment\(state\)/);
  assert.match(fallback, /isPasskeyEnrollmentPageUrl/);
  assert.match(fallback, /passkey_enrollment/);
});
