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
