const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const hotmailUtils = require('../hotmail-utils.js');

const rootDir = path.resolve(__dirname, '..');

test('hotmail utils classifies Microsoft service abuse mode as account unavailable', () => {
  const message = [
    'Hotmail API 对接请求失败：Microsoft mailbox request failed:',
    'graph/entra-common-delegated: AADSTS70000:',
    'User account is found to be in service abuse mode.',
  ].join(' ');

  assert.equal(hotmailUtils.isHotmailMailboxAccountUnavailableError(message), true);
  assert.equal(hotmailUtils.isHotmailMailboxAccountUnavailableError(new Error(message)), true);
  assert.equal(
    hotmailUtils.isHotmailMailboxAccountUnavailableError('Hotmail API 对接请求超时（>30 秒）：INBOX'),
    false
  );
});

test('background marks unavailable Hotmail accounts and restarts signup with next mailbox', () => {
  const source = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');

  assert.match(source, /HOTMAIL_MAILBOX_UNAVAILABLE_PREFIX\s*=\s*'HOTMAIL_MAILBOX_UNAVAILABLE::'/);
  assert.match(source, /function\s+isHotmailMailboxUnavailableFailure\s*\(/);
  assert.match(source, /async\s+function\s+markHotmailMailboxAccountUnavailable\s*\(/);
  assert.match(source, /isHotmailMailboxAccountUnavailableError\(err\)/);
  assert.match(source, /used:\s*true[\s\S]{0,120}lastError:\s*reason/);
  assert.match(source, /await\s+markHotmailMailboxAccountUnavailable\(account,\s*err\.message/s);
  assert.match(source, /throw\s+new\s+Error\(`\$\{HOTMAIL_MAILBOX_UNAVAILABLE_PREFIX\}/);
  assert.match(source, /if\s*\(isHotmailMailboxUnavailableFailure\(err\)\)/);
  assert.match(source, /节点 fetch-signup-code：Hotmail 当前邮箱不可用，准备切换下一个邮箱重新开始/);
});
