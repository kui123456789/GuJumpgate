const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

require('../phone-sms/providers/five-sim.js');

const fiveSim = globalThis.PhoneSmsFiveSimProvider;
const rootDir = path.resolve(__dirname, '..');
const phoneVerificationFlowJs = fs.readFileSync(path.join(rootDir, 'background', 'phone-verification-flow.js'), 'utf8');

function extractFunctionSource(source, functionName) {
  const prefix = `function ${functionName}`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `missing ${functionName}`);
  const paramsStart = source.indexOf('(', start);
  assert.notEqual(paramsStart, -1, `missing ${functionName} params`);
  let paramDepth = 0;
  let bodyStart = -1;
  for (let index = paramsStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(') paramDepth += 1;
    if (char === ')') {
      paramDepth -= 1;
      if (paramDepth === 0) {
        bodyStart = source.indexOf('{', index);
        break;
      }
    }
  }
  assert.notEqual(bodyStart, -1, `missing ${functionName} body`);
  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(start, index + 1);
      }
    }
  }
  throw new Error(`unterminated ${functionName}`);
}

test('5sim provider preserves explicitly cleared country order', () => {
  const provider = fiveSim.createProvider();

  assert.deepEqual(
    provider.resolveCountryCandidates({
      fiveSimCountryOrder: [],
      fiveSimCountryId: 'thailand',
      fiveSimCountryFallback: [{ id: 'usa', label: '美国 (United States)' }],
    }),
    []
  );
});

test('phone verification fallback preserves explicitly cleared 5sim country order', () => {
  const source = extractFunctionSource(phoneVerificationFlowJs, 'resolveFiveSimCountryCandidates');
  assert.match(source, /hasExplicitCountryOrder/);
  assert.match(source, /Object\.prototype\.hasOwnProperty\.call\(state,\s*'fiveSimCountryOrder'\)/);
});
