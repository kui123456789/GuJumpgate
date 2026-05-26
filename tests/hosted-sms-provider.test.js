const assert = require('node:assert/strict');
const test = require('node:test');

const hostedSms = require('../phone-sms/providers/hosted-sms.js');

test('hosted-sms parses phone-url pool entries and removes cache timestamp', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100----https://example.test/api/sms/recordText?key=replace-me&t=123',
      '12092905100----https://example.test/api/sms/recordText?t=456&key=replace-me',
      '2092905100----https://example.test/api/sms/recordText?key=replace-me',
    ].join('\n')
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].phone, '2092905100');
  assert.equal(entries[0].countryLabel, 'United States (+1)');
  assert.equal(entries[0].verificationUrl, 'https://example.test/api/sms/recordText?key=replace-me');
  assert.equal(entries[0].key, '2092905100----https://example.test/api/sms/recordText?key=replace-me');
});

test('hosted-sms supports two-line phone and url entry format', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100',
      'https://example.test/api/sms/recordText?key=replace-me&t=123',
    ].join('\n')
  );

  assert.equal(entries.length, 1);
  assert.equal(entries[0].phone, '2092905100');
  assert.equal(entries[0].verificationUrl, 'https://example.test/api/sms/recordText?key=replace-me');
});

test('hosted-sms normalizes US local phone and activation country', async () => {
  const usagePatches = [];
  const provider = hostedSms.createProvider({
    setState: async (patch) => {
      usagePatches.push(patch);
    },
  });

  const activation = await provider.requestActivation({
    hostedSmsPoolText: '12092905100----https://example.test/api/sms/recordText?key=replace-me',
  });

  assert.equal(hostedSms.normalizeHostedSmsPhone('12092905100'), '2092905100');
  assert.equal(activation.provider, 'hosted-sms');
  assert.equal(activation.phoneNumber, '2092905100');
  assert.equal(activation.countryId, 'US');
  assert.equal(activation.countryLabel, 'United States (+1)');
  assert.equal(activation.verificationUrl, 'https://example.test/api/sms/recordText?key=replace-me');
  assert.equal(usagePatches.length, 1);
  assert.equal(usagePatches[0].hostedSmsCurrentEntry.key, activation.activationId);
});

test('hosted-sms sends US dial code for local numbers that look like international prefixes', async () => {
  require('../background/phone-verification-flow.js');

  const submittedPayloads = [];
  const state = {
    phoneSmsProvider: 'hosted-sms',
    hostedSmsPoolText: '3802318796----https://example.test/api/sms/recordText?key=replace-me',
    hostedSmsPoolUsage: {},
    phoneCodeWaitSeconds: 15,
    phoneCodeTimeoutWindows: 1,
    phoneCodePollIntervalSeconds: 1,
    phoneCodePollMaxRounds: 1,
  };

  const helpers = globalThis.MultiPageBackgroundPhoneVerification.createPhoneVerificationHelpers({
    addLog: async () => {},
    ensureStep8SignupPageReady: async () => {},
    getState: async () => state,
    setState: async (updates) => Object.assign(state, updates || {}),
    sleepWithStop: async () => {},
    throwIfStopped: () => {},
    fetchImpl: async () => ({
      ok: true,
      text: async () => 'Your verification code is 123456.',
    }),
    sendToContentScriptResilient: async (_target, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPayloads.push(message.payload);
        return {
          addPhonePage: false,
          phoneVerificationPage: true,
        };
      }
      if (message.type === 'SUBMIT_PHONE_VERIFICATION_CODE') {
        return {
          ok: true,
          url: 'https://chatgpt.com/',
        };
      }
      if (message.type === 'STEP8_GET_STATE') {
        return {
          addPhonePage: false,
          phoneVerificationPage: true,
        };
      }
      return {};
    },
  });

  await helpers.completePhoneVerificationFlow(1, {
    addPhonePage: true,
    phoneVerificationPage: false,
    url: 'https://auth.openai.com/add-phone',
  });

  assert.equal(submittedPayloads.length, 1);
  assert.equal(submittedPayloads[0].phoneNumber, '3802318796');
  assert.match(submittedPayloads[0].countryLabel, /\+1/);
});

test('hosted-sms extracts verification codes from text and nested JSON fields', () => {
  const cases = [
    ['Your verification code is 123456.', '123456'],
    [{ data: { message: 'OpenAI verification code: 234567' } }, '234567'],
    [{ sms: { body: '验证码：345678，请勿泄露。' } }, '345678'],
    [{ code: '456789' }, '456789'],
    [{ otp: '5 6 7 8 9 0' }, '567890'],
  ];

  for (const [payload, expected] of cases) {
    assert.equal(hostedSms.extractHostedSmsVerificationCode(payload), expected);
  }
});

test('hosted-sms ignores metadata numbers before message text', () => {
  const code = hostedSms.extractHostedSmsVerificationCode({
    data: {
      phone: '+12092905100',
      order_id: '7654321',
      created_at: '2026-05-25 12:30:45',
      message: 'Your verification code is 246810.',
    },
  });

  assert.equal(code, '246810');
});

test('hosted-sms chooses the least-used pool entry', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100----https://example.test/api/a?key=one',
      '2092905101----https://example.test/api/a?key=two',
      '2092905102----https://example.test/api/a?key=three',
    ].join('\n')
  );
  const usage = {
    [entries[0].key]: { useCount: 1, usedAt: 2000 },
    [entries[1].key]: { useCount: 0, usedAt: 3000 },
    [entries[2].key]: { useCount: 0, usedAt: 1000 },
  };

  const selected = hostedSms.chooseHostedSmsPoolEntry(entries, usage);

  assert.equal(selected.key, entries[2].key);
});

test('hosted-sms skips blocked entries when rotating numbers', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100----https://example.test/api/a?key=one',
      '2092905101----https://example.test/api/a?key=two',
    ].join('\n')
  );

  const selected = hostedSms.chooseHostedSmsPoolEntry(entries, {}, {
    blockedHostedSmsPoolKeys: [entries[0].key],
  });
  const exhausted = hostedSms.chooseHostedSmsPoolEntry(entries, {}, {
    blockedHostedSmsPoolKeys: entries.map((entry) => entry.key),
  });

  assert.equal(selected.key, entries[1].key);
  assert.equal(exhausted, null);
});

test('hosted-sms skips pool entries after three uses', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100----https://example.test/api/a?key=one',
      '2092905101----https://example.test/api/a?key=two',
    ].join('\n')
  );
  const usage = {
    [entries[0].key]: { useCount: 3, usedAt: 1000 },
    [entries[1].key]: { useCount: 2, usedAt: 2000 },
  };

  const selected = hostedSms.chooseHostedSmsPoolEntry(entries, usage);

  assert.equal(selected.key, entries[1].key);
});

test('hosted-sms returns no pool entry when all numbers reached three uses', () => {
  const entries = hostedSms.parseHostedSmsPoolEntries(
    [
      '2092905100----https://example.test/api/a?key=one',
      '2092905101----https://example.test/api/a?key=two',
    ].join('\n')
  );
  const usage = {
    [entries[0].key]: { useCount: 3, usedAt: 1000 },
    [entries[1].key]: { useCount: 4, usedAt: 2000 },
  };

  const selected = hostedSms.chooseHostedSmsPoolEntry(entries, usage);

  assert.equal(selected, null);
});
