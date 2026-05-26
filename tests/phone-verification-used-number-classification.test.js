const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(rootDir, 'background', 'phone-verification-flow.js'), 'utf8');

function extractFunction(functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);

  const openBrace = source.indexOf('{', start);
  assert.notEqual(openBrace, -1, `missing opening brace for ${functionName}`);

  let depth = 0;
  for (let index = openBrace; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }

  throw new Error(`missing closing brace for ${functionName}`);
}

const isPhoneNumberUsedError = vm.runInNewContext(`(${extractFunction('isPhoneNumberUsedError')})`);
const isPhoneNumberVirtualPhoneError = vm.runInNewContext(`(${extractFunction('isPhoneNumberVirtualPhoneError')})`);

test('phone verification treats max-associated Chinese add-phone rejection as used number', () => {
  [
    '此电话号码已关联到可关联的最多账户。',
    '此手机号已关联到可关联的最多账户。',
    '该电话号码已经关联到最多账户。',
    'This phone number is already linked to the maximum number of accounts.',
  ].forEach((message) => {
    assert.equal(isPhoneNumberUsedError(message), true, message);
  });
});

test('phone verification does not classify delivery errors as used numbers', () => {
  assert.equal(
    isPhoneNumberUsedError('无法向此电话号码发送验证码，请尝试其他号码。'),
    false
  );
});

test('phone verification classifies virtual or VoIP add-phone rejection separately from used numbers', () => {
  [
    '这似乎是个虚拟号码（也称为 VoIP）。请提供有效的非虚拟电话号码以继续。',
    'This appears to be a virtual phone number, also known as VoIP. Please provide a valid non-virtual phone number to continue.',
    'Please provide a non virtual phone number.',
  ].forEach((message) => {
    assert.equal(isPhoneNumberVirtualPhoneError(message), true, message);
    assert.equal(isPhoneNumberUsedError(message), false, message);
  });
});

test('phone verification rotates add-phone virtual number rejections', () => {
  assert.match(source, /isPhoneNumberVirtualPhoneError\(addPhoneRejectText\)/);
  assert.match(source, /isPhoneNumberVirtualPhoneError\(retryRejectText\)/);
  assert.match(source, /phone_virtual_number/);
});
