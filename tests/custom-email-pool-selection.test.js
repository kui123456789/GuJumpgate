const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const rootDir = path.resolve(__dirname, '..');
const backgroundJs = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');

function extractBackgroundFunction(functionName) {
  const start = backgroundJs.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `missing function ${functionName}`);
  let parenDepth = 0;
  let openBrace = -1;
  for (let index = backgroundJs.indexOf('(', start); index < backgroundJs.length; index += 1) {
    const char = backgroundJs[index];
    if (char === '(') parenDepth += 1;
    if (char === ')') {
      parenDepth -= 1;
      if (parenDepth === 0) {
        openBrace = backgroundJs.indexOf('{', index);
        break;
      }
    }
  }
  assert.notEqual(openBrace, -1, `missing opening brace for ${functionName}`);
  let depth = 0;
  for (let index = openBrace; index < backgroundJs.length; index += 1) {
    const char = backgroundJs[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return backgroundJs.slice(start, index + 1);
      }
    }
  }
  throw new Error(`missing closing brace for ${functionName}`);
}

const getCustomEmailPoolEmailForRun = vm.runInNewContext(`
  const CUSTOM_EMAIL_POOL_GENERATOR = 'custom-pool';
  function normalizeEmailGenerator(value = '') {
    return String(value || '').trim().toLowerCase();
  }
  function parseHiddenEmailCredential(value = '') {
    const [email = '', credential = ''] = String(value || '').split('----');
    return {
      email: String(email || '').trim().toLowerCase(),
      credential: String(credential || '').trim(),
    };
  }
  ${extractBackgroundFunction('normalizeCustomEmailPool')}
  ${extractBackgroundFunction('parseCustomEmailPoolEntryForState')}
  ${extractBackgroundFunction('normalizeCustomEmailVerificationUrlForState')}
  ${extractBackgroundFunction('normalizeCustomEmailPoolEntryObjects')}
  ${extractBackgroundFunction('getCustomEmailPool')}
  ${extractBackgroundFunction('getCustomEmailPoolEmailForRun')}
  getCustomEmailPoolEmailForRun;
`);

test('custom email pool picks the first unused entry after earlier entries are marked used', () => {
  const state = {
    emailGenerator: 'custom-pool',
    customEmailPoolEntries: [
      { email: 'first@example.com', enabled: true, used: true, lastUsedAt: 1000 },
      { email: 'second@example.com', enabled: true, used: false },
      { email: 'third@example.com', enabled: true, used: false },
    ],
    customEmailPool: ['second@example.com', 'third@example.com'],
  };

  assert.equal(getCustomEmailPoolEmailForRun(state, 2), 'second@example.com');
});
