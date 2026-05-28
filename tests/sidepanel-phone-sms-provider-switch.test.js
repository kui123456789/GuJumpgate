const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');

function extractFunction(name) {
  const start = sidepanelJs.indexOf(`function ${name}`);
  assert.notEqual(start, -1, `missing function ${name}`);
  const nextFunction = sidepanelJs.indexOf('\nfunction ', start + 1);
  return sidepanelJs.slice(start, nextFunction === -1 ? undefined : nextFunction);
}

function extractFunctionCalls(functionName) {
  const calls = [];
  let cursor = 0;
  const needle = `${functionName}(`;
  while (cursor < sidepanelJs.length) {
    const start = sidepanelJs.indexOf(needle, cursor);
    if (start < 0) break;
    const before = sidepanelJs.slice(Math.max(0, start - 20), start);
    cursor = start + needle.length;
    if (/function\s+$/.test(before)) continue;
    let depth = 0;
    for (let index = start; index < sidepanelJs.length; index += 1) {
      const char = sidepanelJs[index];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(sidepanelJs.slice(start, index + 1));
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return calls;
}

test('sidepanel has one phone SMS provider change handler', () => {
  const listeners = sidepanelJs.match(/selectPhoneSmsProvider\?\.addEventListener\('change'/g) || [];
  assert.equal(listeners.length, 1);
  assert.match(
    sidepanelJs,
    /selectPhoneSmsProvider\?\.addEventListener\('change',\s*\(\)\s*=>\s*\{\s*switchPhoneSmsProvider\(selectPhoneSmsProvider\.value\)/
  );
});

test('phone SMS settings panel follows the selected provider, not provider order fallback', () => {
  const updateUi = extractFunction('updatePhoneVerificationSettingsUI');

  assert.match(updateUi, /const\s+provider\s*=\s*typeof\s+getSelectedPhoneSmsProvider\s*===\s*'function'/);
  assert.doesNotMatch(updateUi, /providerOrderForDisplay\[0\]/);
});

test('switching phone SMS provider makes the selected provider first in runtime order', () => {
  const switchProvider = extractFunction('switchPhoneSmsProvider');

  assert.match(sidepanelJs, /function\s+buildPhoneSmsProviderOrderAfterProviderSwitch\s*\(/);
  assert.match(
    switchProvider,
    /phoneSmsProviderOrder:\s*buildPhoneSmsProviderOrderAfterProviderSwitch\(\s*normalizedNextProvider,\s*phoneSmsProviderOrderSelection\s*\|\|\s*latestState\?\.phoneSmsProviderOrder\s*\|\|\s*\[\]\s*\)/
  );
  assert.match(
    switchProvider,
    /applyPhoneSmsProviderOrderSelection\(\s*latestState\?\.phoneSmsProviderOrder\s*\|\|\s*\[\],[\s\S]*?ensureDefault:\s*false,[\s\S]*?syncProvider:\s*false/
  );
});

test('switching provider restores the target provider API key from its own field', () => {
  const switchProvider = extractFunction('switchPhoneSmsProvider');

  assert.match(switchProvider, /currentFiveSimApiKey\s*\|\|\s*currentApiKey/);
  assert.match(switchProvider, /patch\.nexSmsApiKey\s*=\s*currentNexSmsApiKey/);
  assert.match(switchProvider, /patch\.smsBowerApiKey\s*=\s*currentSmsBowerApiKey\s*\|\|\s*currentApiKey/);
  assert.match(switchProvider, /patch\.smsVerificationNumberApiKey\s*=\s*currentApiKey/);
  assert.match(switchProvider, /patch\.grizzlySmsApiKey\s*=\s*currentApiKey/);
  assert.match(switchProvider, /patch\.smsPoolApiKey\s*=\s*currentApiKey/);

  assert.match(switchProvider, /inputHeroSmsApiKey\.value\s*=\s*String\(latestState\?\.heroSmsApiKey\s*\|\|\s*''\)/);
  assert.match(switchProvider, /inputFiveSimApiKey\.value\s*=\s*String\(latestState\?\.fiveSimApiKey\s*\|\|\s*''\)/);
  assert.match(switchProvider, /inputNexSmsApiKey\.value\s*=\s*String\(latestState\?\.nexSmsApiKey\s*\|\|\s*''\)/);
  assert.match(switchProvider, /inputSmsBowerApiKey\.value\s*=\s*String\(latestState\?\.smsBowerApiKey\s*\|\|\s*''\)/);
});

test('sidepanel preserves cleared country order when applying provider state', () => {
  for (const functionName of [
    'applyFiveSimCountrySelection',
    'applyNexSmsCountrySelection',
    'applySmsBowerCountrySelection',
  ]) {
    const calls = extractFunctionCalls(functionName);
    assert.ok(calls.length >= 4, `expected ${functionName} call sites`);
    for (const call of calls) {
      assert.match(call, /ensureDefault:\s*false/, call);
    }
  }
});

test('sidepanel can persist explicitly cleared Hero-like country selection', () => {
  const getSelectedHeroCountry = extractFunction('getSelectedHeroSmsCountryOption');
  const switchProvider = extractFunction('switchPhoneSmsProvider');

  assert.match(getSelectedHeroCountry, /return\s+selectedCountries\[0\]\s*\|\|\s*null/);
  assert.match(switchProvider, /getPhoneSmsCountrySelectionForProvider\(previousProvider,\s*\{\s*ensureDefault:\s*false\s*\}\)/);
  assert.match(sidepanelJs, /id:\s*0,\s*label:\s*''/);
});

test('sidepanel sanitizes handler-api service codes when saving settings', () => {
  assert.match(sidepanelJs, /const\s+smsVerificationNumberServiceCodeValue\s*=\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.smsVerificationNumberServiceCode,\s*DEFAULT_SMS_VERIFICATION_NUMBER_SERVICE_CODE\s*\)/);
  assert.match(sidepanelJs, /const\s+grizzlySmsServiceCodeValue\s*=\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.grizzlySmsServiceCode,\s*DEFAULT_GRIZZLY_SMS_SERVICE_CODE\s*\)/);
  assert.match(sidepanelJs, /const\s+smsPoolServiceCodeValue\s*=\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.smsPoolServiceCode,\s*DEFAULT_SMSPOOL_SERVICE_CODE\s*\)/);

  assert.match(sidepanelJs, /smsVerificationNumberServiceCode:\s*smsVerificationNumberServiceCodeValue/);
  assert.match(sidepanelJs, /grizzlySmsServiceCode:\s*grizzlySmsServiceCodeValue/);
  assert.match(sidepanelJs, /smsPoolServiceCode:\s*smsPoolServiceCodeValue/);
});

test('sidepanel price preview queries OpenAI service for all handler-api providers', () => {
  assert.match(sidepanelJs, /url\.searchParams\.set\('service',\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.smsVerificationNumberServiceCode,\s*DEFAULT_SMS_VERIFICATION_NUMBER_SERVICE_CODE\s*\)\)/);
  assert.match(sidepanelJs, /url\.searchParams\.set\('service',\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.grizzlySmsServiceCode,\s*DEFAULT_GRIZZLY_SMS_SERVICE_CODE\s*\)\)/);
  assert.match(sidepanelJs, /url\.searchParams\.set\('service',\s*normalizeHandlerApiServiceCodeValue\(\s*latestState\?\.smsPoolServiceCode,\s*DEFAULT_SMSPOOL_SERVICE_CODE\s*\)\)/);
});
