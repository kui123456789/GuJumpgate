const assert = require('node:assert/strict');
const test = require('node:test');

const smsBower = require('../phone-sms/providers/smsbower.js');

test('smsbower exposes OpenAI service and supported countries including Nigeria Ghana and US', () => {
  assert.equal(smsBower.DEFAULT_SERVICE_CODE, 'dr');
  assert.equal(smsBower.DEFAULT_COUNTRY_ORDER[0], 12);
  assert.ok(smsBower.DEFAULT_COUNTRY_ORDER.includes(19));
  assert.ok(smsBower.DEFAULT_COUNTRY_ORDER.includes(38));
  assert.ok(smsBower.DEFAULT_COUNTRY_ORDER.includes(12));
  assert.ok(smsBower.DEFAULT_COUNTRY_ORDER.includes(187));

  const countriesById = new Map(smsBower.SUPPORTED_COUNTRY_ITEMS.map((entry) => [entry.id, entry]));
  assert.equal(countriesById.get(12).label, '美国 +1 (United States)');
  assert.equal(countriesById.get(12).phonePrefix, '1');
  assert.equal(countriesById.get(187).label, '美国虚拟 +1 (United States Virtual)');
  assert.equal(countriesById.get(187).phonePrefix, '1');
  assert.equal(countriesById.get(19).label, '尼日利亚 +234 (Nigeria)');
  assert.equal(countriesById.get(19).phonePrefix, '234');
  assert.equal(countriesById.get(7).label, '马来西亚 +60 (Malaysia)');
  assert.equal(countriesById.get(38).label, '加纳 +233 (Ghana)');
});

test('smsbower normalizes US +1 numbers to local ten digit submit phone', () => {
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('+12092905100', 12), '2092905100');
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('12092905100', 12), '2092905100');
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('+12092905100', 187), '2092905100');
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('12092905100', 187), '2092905100');
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('2092905100', 187), '2092905100');
});

test('smsbower does not strip country prefix from non-US numbers', () => {
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('+60123456789', 7), '60123456789');
  assert.equal(smsBower.normalizeSmsBowerPhoneForSubmit('+233241234567', 38), '233241234567');
});

test('smsbower parses activation and preserves raw phone for US local submission', () => {
  const activation = smsBower.parseActivationPayload('ACCESS_NUMBER:12345:+12092905100', {
    countryId: 187,
    countryLabel: '美国 +1 (United States)',
  });

  assert.equal(activation.activationId, '12345');
  assert.equal(activation.provider, 'smsbower');
  assert.equal(activation.phoneNumber, '2092905100');
  assert.equal(activation.rawPhoneNumber, '+12092905100');
  assert.equal(activation.countryId, 187);
  assert.equal(activation.countryLabel, '美国 +1 (United States)');
});

test('smsbower parses balance status and verification code responses', () => {
  assert.equal(smsBower.parseBalancePayload('ACCESS_BALANCE:12.345').balance, 12.345);
  assert.equal(smsBower.extractVerificationCodeFromStatus('STATUS_OK: 123456'), '123456');
  assert.equal(smsBower.extractVerificationCodeFromStatus('STATUS_WAIT_RETRY:654321'), '');
  assert.equal(smsBower.isWaitingStatus('STATUS_WAIT_CODE'), true);
  assert.equal(smsBower.isWaitingStatus('STATUS_WAIT_RETRY:654321'), true);
  assert.equal(smsBower.isCancelledStatus('STATUS_CANCEL'), true);
});

test('smsbower requestActivation uses getNumber with service country and price bounds', async () => {
  const requestedUrls = [];
  const provider = smsBower.createProvider({
    fetchImpl: async (url) => {
      requestedUrls.push(new URL(url));
      return {
        ok: true,
        text: async () => 'ACCESS_NUMBER:abc:12092905100',
      };
    },
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'key-1',
    smsBowerCountryOrder: [187],
    smsBowerServiceCode: 'dr',
    heroSmsMinPrice: '0.05',
    heroSmsMaxPrice: '0.12',
  });

  assert.equal(requestedUrls.length, 1);
  assert.equal(requestedUrls[0].searchParams.get('action'), 'getNumber');
  assert.equal(requestedUrls[0].searchParams.get('service'), 'dr');
  assert.equal(requestedUrls[0].searchParams.get('country'), '187');
  assert.equal(requestedUrls[0].searchParams.get('minPrice'), '0.05');
  assert.equal(requestedUrls[0].searchParams.get('maxPrice'), '0.12');
  assert.equal(activation.phoneNumber, '2092905100');
  assert.equal(activation.rawPhoneNumber, '12092905100');
});

test('smsbower coerces generic service aliases to OpenAI service', async () => {
  for (const serviceCode of ['ot', 'any']) {
    const requestedUrls = [];
    const provider = smsBower.createProvider({
      fetchImpl: async (url) => {
        requestedUrls.push(new URL(url));
        return {
          ok: true,
          text: async () => `ACCESS_NUMBER:${serviceCode}:12092905100`,
        };
      },
    });

    await provider.requestActivation({
      smsBowerApiKey: 'key-1',
      smsBowerCountryOrder: [187],
      smsBowerServiceCode: serviceCode,
    });

    assert.equal(requestedUrls[0].searchParams.get('service'), 'dr');
  }
});

test('smsbower skips and cancels numbers whose returned dial code does not match the requested country', async () => {
  const requestedCountries = [];
  const cancelledIds = [];
  const provider = smsBower.createProvider({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      const action = parsed.searchParams.get('action');
      if (action === 'setStatus') {
        cancelledIds.push(`${parsed.searchParams.get('id')}:${parsed.searchParams.get('status')}`);
        return {
          ok: true,
          text: async () => 'ACCESS_CANCEL',
        };
      }
      assert.equal(action, 'getNumber');
      const country = parsed.searchParams.get('country');
      requestedCountries.push(country);
      if (country === '19') {
        return {
          ok: true,
          text: async () => 'ACCESS_NUMBER:nigeria-wrong:+22723490217',
        };
      }
      return {
        ok: true,
        text: async () => 'ACCESS_NUMBER:ghana-ok:+233241234567',
      };
    },
  });

  const activation = await provider.requestActivation({
    smsBowerApiKey: 'key-1',
    smsBowerCountryOrder: [19, 38],
    smsBowerServiceCode: 'dr',
  });

  assert.deepEqual(requestedCountries, ['19', '38']);
  assert.deepEqual(cancelledIds, ['nigeria-wrong:8']);
  assert.equal(activation.activationId, 'ghana-ok');
  assert.equal(activation.countryId, 38);
  assert.equal(activation.phoneNumber, '233241234567');
});

test('smsbower does not retry countries blocked by Step9 rotation', async () => {
  const requestedCountries = [];
  const provider = smsBower.createProvider({
    fetchImpl: async (url) => {
      const parsed = new URL(url);
      requestedCountries.push(parsed.searchParams.get('country'));
      return {
        ok: true,
        text: async () => 'ACCESS_NUMBER:blocked-country:+2348020779433',
      };
    },
  });

  await assert.rejects(
    () => provider.requestActivation({
      smsBowerApiKey: 'key-1',
      smsBowerCountryOrder: [19],
      smsBowerServiceCode: 'dr',
    }, {
      blockedCountryIds: ['19'],
    }),
    /已跳过所有候选国家|blocked/i
  );

  assert.deepEqual(requestedCountries, []);
});

test('smsbower pollActivationCode returns code and terminal states throw', async () => {
  const provider = smsBower.createProvider({
    fetchImpl: async () => ({
      ok: true,
      text: async () => 'STATUS_OK: 987654',
    }),
    sleepWithStop: async () => {},
  });

  const code = await provider.pollActivationCode({ smsBowerApiKey: 'key-1' }, {
    activationId: 'abc',
    phoneNumber: '2092905100',
    provider: 'smsbower',
    countryId: 187,
  }, {
    timeoutMs: 1000,
    intervalMs: 1,
    maxRounds: 1,
  });

  assert.equal(code, '987654');
});
