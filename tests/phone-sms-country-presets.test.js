const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const backgroundJs = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
const phoneVerificationFlowJs = fs.readFileSync(path.join(rootDir, 'background', 'phone-verification-flow.js'), 'utf8');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
const fiveSimProviderJs = fs.readFileSync(path.join(rootDir, 'phone-sms', 'providers', 'five-sim.js'), 'utf8');
const smsBower = require('../phone-sms/providers/smsbower.js');

function extractObjectFreezeArray(source, constName) {
  const match = source.match(new RegExp(`const\\s+${constName}\\s*=\\s*Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\)`));
  assert.ok(match, `missing ${constName}`);
  return match[1];
}

function assertArrayLiteralContains(source, constName, expectedEntries) {
  const body = extractObjectFreezeArray(source, constName);
  for (const entry of expectedEntries) {
    const literal = String(entry);
    assert.match(body, new RegExp(literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${constName} missing ${entry}`);
  }
}

test('sidepanel country menus allow the requested phone-country preset size', () => {
  assert.match(sidepanelJs, /const\s+HERO_SMS_COUNTRY_SELECTION_MAX\s*=\s*12/);
  assert.match(sidepanelHtml, /多选最多 12 个，按点击顺序生效。/);
});

test('5sim defaults preselect requested countries with known 5sim slugs', () => {
  const requestedFiveSimSlugs = [
    "'thailand'",
    "'taiwan'",
    "'usa'",
    "'japan'",
    "'canada'",
    "'france'",
    "'easttimor'",
  ];
  assertArrayLiteralContains(sidepanelJs, 'DEFAULT_FIVE_SIM_COUNTRY_ORDER', requestedFiveSimSlugs);
  assertArrayLiteralContains(backgroundJs, 'DEFAULT_FIVE_SIM_COUNTRY_ORDER', requestedFiveSimSlugs);
  assert.match(phoneVerificationFlowJs, /DEFAULT_FIVE_SIM_COUNTRY_ORDER\s*=\s*\[[^\]]*'taiwan'[^\]]*'easttimor'[^\]]*\]/);

  for (const slug of ['taiwan', 'canada', 'france', 'easttimor']) {
    assert.match(fiveSimProviderJs, new RegExp(`id:\\s*'${slug}'`));
    assert.match(sidepanelJs, new RegExp(`id:\\s*'${slug}'`));
  }
});

test('handler-api style providers preselect requested countries with known numeric ids', () => {
  const requestedHandlerIds = [52, 55, 187, 182, 204, 36, 78, 91];
  assertArrayLiteralContains(sidepanelJs, 'DEFAULT_NEX_SMS_COUNTRY_ORDER', requestedHandlerIds);
  assertArrayLiteralContains(sidepanelJs, 'DEFAULT_SMS_BOWER_COUNTRY_ORDER', [12, ...requestedHandlerIds]);
  assertArrayLiteralContains(backgroundJs, 'DEFAULT_NEX_SMS_COUNTRY_ORDER', requestedHandlerIds);
  assertArrayLiteralContains(backgroundJs, 'DEFAULT_SMS_BOWER_COUNTRY_ORDER', [12, ...requestedHandlerIds]);
  assert.match(phoneVerificationFlowJs, /DEFAULT_NEX_SMS_COUNTRY_ORDER\s*=\s*\[[^\]]*55[^\]]*91[^\]]*\]/);
  assert.match(phoneVerificationFlowJs, /DEFAULT_SMS_BOWER_COUNTRY_ORDER\s*=\s*\[[^\]]*55[^\]]*204[^\]]*91[^\]]*\]/);
});

test('SMSBower exposes labels and dial prefixes for the requested supported countries', () => {
  const countriesById = new Map(smsBower.SUPPORTED_COUNTRY_ITEMS.map((entry) => [entry.id, entry]));
  const expected = [
    [52, '泰国 +66 (Thailand)', '66'],
    [55, '台湾 +886 (Taiwan)', '886'],
    [12, '美国 +1 (United States)', '1'],
    [187, '美国虚拟 +1 (United States Virtual)', '1'],
    [182, '日本 +81 (Japan)', '81'],
    [204, '纽埃 +683 (Niue)', '683'],
    [36, '加拿大 +1 (Canada)', '1'],
    [78, '法国 +33 (France)', '33'],
    [91, '东帝汶 +670 (Timor-Leste)', '670'],
  ];

  for (const [id, label, phonePrefix] of expected) {
    assert.equal(countriesById.get(id)?.label, label);
    assert.equal(countriesById.get(id)?.phonePrefix, phonePrefix);
  }
});

test('sidepanel fallback country lists display the requested supported country labels', () => {
  for (const label of [
    '泰国 +66 (Thailand)',
    '台湾 +886 (Taiwan)',
    '美国 +1 (United States)',
    '日本 +81 (Japan)',
    '纽埃 +683 (Niue)',
    '加拿大 +1 (Canada)',
    '法国 +33 (France)',
    '东帝汶 +670 (Timor-Leste)',
  ]) {
    assert.match(sidepanelJs + sidepanelHtml, new RegExp(label.replace(/[()+]/g, '\\$&')));
  }
});
