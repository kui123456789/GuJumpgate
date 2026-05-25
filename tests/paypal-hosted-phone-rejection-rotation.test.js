const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

test('paypal hosted checkout detects and dismisses rejected phone dialog', () => {
  const source = fs.readFileSync(path.join(rootDir, 'content', 'paypal-flow.js'), 'utf8');

  assert.match(source, /PAYPAL_HOSTED_STAGE_PHONE_REJECTED\s*=\s*'phone_rejected'/);
  assert.match(source, /function\s+getHostedPhoneRejectedErrorText\s*\(/);
  assert.match(source, /unable\\s\+to\\s\+complete\\s\+your\\s\+request/i);
  assert.match(source, /try\\s\+a\\s\+different\\s\+phone\\s\+number/i);
  assert.match(source, /function\s+findHostedPhoneRejectedDismissButton\s*\(/);
  assert.match(source, /dismissPhoneError/);
  assert.match(source, /hostedPhoneRejected/);
  assert.match(source, /hostedPhoneErrorText/);
  assert.match(source, /hostedPhoneErrorDismissReady/);
});

test('paypal hosted checkout marks rejected pool phone blocked and rotates', () => {
  const source = fs.readFileSync(path.join(rootDir, 'background', 'steps', 'create-plus-checkout.js'), 'utf8');

  assert.match(source, /blockedAt:\s*Math\.max\(0,\s*Number\(usage\.blockedAt\)/);
  assert.match(source, /blockedReason:\s*String\(usage\.blockedReason/);
  assert.match(source, /if\s*\(itemUsage\.blockedAt\)\s*\{/);
  assert.match(source, /async\s+function\s+blockHostedCheckoutCurrentSmsEntry\s*\(/);
  assert.match(source, /async\s+function\s+rotateHostedCheckoutSmsEntryAfterPhoneReject\s*\(/);
  assert.match(source, /hostedPhoneRejected/);
  assert.match(source, /dismissPhoneError:\s*true/);
  assert.match(source, /PayPal hosted checkout 号码被拒绝，已标记当前号码不可用并切换下一个号码/);
  assert.match(source, /PayPal hosted checkout 没有可用号码/);
  assert.match(source, /固定电话.*无法自动换号|单独配置的固定电话/);
});

test('paypal hosted checkout persists blocked pool usage fields', () => {
  const source = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');

  assert.match(source, /case 'hostedCheckoutSmsPoolUsage':/);
  assert.match(source, /blockedAt:\s*Math\.max\(0,\s*Number\(item\.blockedAt\)/);
  assert.match(source, /blockedReason:\s*String\(item\.blockedReason/);
});
