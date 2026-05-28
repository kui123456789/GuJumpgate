const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const registryJs = fs.readFileSync(path.join(rootDir, 'phone-sms', 'providers', 'registry.js'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
const phoneVerificationFlowJs = fs.readFileSync(path.join(rootDir, 'background', 'phone-verification-flow.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');
const signupPageJs = fs.readFileSync(path.join(rootDir, 'content', 'signup-page.js'), 'utf8');
const phoneAuthJs = fs.readFileSync(path.join(rootDir, 'content', 'phone-auth.js'), 'utf8');

function extractFunctionSource(source, functionName) {
  const prefix = `function ${functionName}`;
  const start = source.indexOf(prefix);
  assert.notEqual(start, -1, `missing ${functionName}`);
  const bodyStart = source.indexOf('{', start);
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

function loadBackgroundSmsBowerCountryOrderNormalizer() {
  const functionSource = extractFunctionSource(backgroundJs, 'normalizeSmsBowerCountryOrder');
  const normalizeSmsBowerCountryId = (value, fallback = 52) => {
    const parsed = Math.floor(Number(value));
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
    const fallbackParsed = Math.floor(Number(fallback));
    return Number.isFinite(fallbackParsed) && fallbackParsed > 0 ? fallbackParsed : 52;
  };
  return new Function(
    'DEFAULT_SMS_BOWER_COUNTRY_ORDER',
    'normalizeSmsBowerCountryId',
    `${functionSource}; return normalizeSmsBowerCountryOrder;`
  )([52, 55, 12], normalizeSmsBowerCountryId);
}

function extractFunctionCalls(source, functionName) {
  const calls = [];
  let cursor = 0;
  const needle = `${functionName}(`;
  while (cursor < source.length) {
    const start = source.indexOf(needle, cursor);
    if (start < 0) break;
    const before = source.slice(Math.max(0, start - 20), start);
    cursor = start + needle.length;
    if (/function\s+$/.test(before)) continue;
    let depth = 0;
    for (let index = start; index < source.length; index += 1) {
      const char = source[index];
      if (char === '(') depth += 1;
      if (char === ')') {
        depth -= 1;
        if (depth === 0) {
          calls.push(source.slice(start, index + 1));
          cursor = index + 1;
          break;
        }
      }
    }
  }
  return calls;
}

test('registry and background load SMSBower provider without changing default provider', () => {
  assert.match(registryJs, /PROVIDER_SMSBOWER\s*=\s*'smsbower'/);
  assert.match(registryJs, /label:\s*'SMSBower'/);
  assert.match(registryJs, /moduleKey:\s*'PhoneSmsBowerProvider'/);
  assert.match(registryJs, /DEFAULT_PROVIDER\s*=\s*PROVIDER_HERO_SMS/);
  assert.match(backgroundJs, /phone-sms\/providers\/smsbower\.js/);
});

test('background preserves an explicitly cleared SMSBower country order', () => {
  const normalizeSmsBowerCountryOrder = loadBackgroundSmsBowerCountryOrderNormalizer();
  assert.deepEqual(normalizeSmsBowerCountryOrder([]), []);
});

test('phone verification flow wires SMSBower into Step9 provider lifecycle', () => {
  assert.match(phoneVerificationFlowJs, /PHONE_SMS_PROVIDER_SMSBOWER\s*=\s*'smsbower'/);
  assert.match(phoneVerificationFlowJs, /createSmsBowerProvider/);
  assert.match(phoneVerificationFlowJs, /getSmsBowerProviderForState/);
  assert.match(phoneVerificationFlowJs, /provider\.requestActivation\(state,\s*options\)/);
  assert.match(phoneVerificationFlowJs, /provider\.pollActivationCode\(state,\s*normalizedActivation,\s*options\)/);
  assert.match(phoneVerificationFlowJs, /provider\.finishActivation\(state,\s*activation\)/);
  assert.match(phoneVerificationFlowJs, /provider\.cancelActivation\(state,\s*activation\)/);
  assert.match(phoneVerificationFlowJs, /provider\.banActivation\(state,\s*activation\)/);
});

test('background fallback SMSBower service normalizer coerces generic aliases to OpenAI', () => {
  const match = backgroundJs.match(/function\s+normalizeSmsBowerServiceCode\s*\([^)]*\)\s*\{[\s\S]*?\n\}/);
  assert.ok(match, 'missing background normalizeSmsBowerServiceCode');
  const source = match[0];
  assert.match(source, /normalized\s*&&\s*normalized\s*!==\s*'ot'\s*&&\s*normalized\s*!==\s*'any'/);
  assert.match(source, /fallbackNormalized\s*&&\s*fallbackNormalized\s*!==\s*'ot'\s*&&\s*fallbackNormalized\s*!==\s*'any'/);
  assert.match(source, /DEFAULT_SMS_BOWER_SERVICE_CODE/);
});

test('sidepanel exposes SMSBower provider controls and countries', () => {
  assert.match(sidepanelHtml, /<option\s+value="smsbower">SMSBower<\/option>/);
  assert.match(sidepanelHtml, /id="row-sms-bower-api-key"/);
  assert.match(sidepanelHtml, /id="input-sms-bower-api-key"/);
  assert.match(sidepanelHtml, /id="row-sms-bower-country"/);
  assert.match(sidepanelHtml, /id="select-sms-bower-country"/);
  assert.match(sidepanelHtml, /美国 \+1 \(United States\)/);
  assert.match(sidepanelHtml, /美国虚拟 \+1 \(United States Virtual\)/);
  assert.match(sidepanelHtml, /尼日利亚 \+234 \(Nigeria\)/);
  assert.match(sidepanelHtml, /马来西亚 \+60 \(Malaysia\)/);
  assert.match(sidepanelHtml, /加纳 \+233 \(Ghana\)/);
  assert.match(sidepanelHtml, /id="row-sms-bower-service-code"/);
  assert.match(sidepanelHtml, /id="input-sms-bower-service-code"/);
});

test('sidepanel lists SMSBower only once in provider selectors', () => {
  const extractSelect = (id) => {
    const match = sidepanelHtml.match(new RegExp(`<select[^>]+id="${id}"[\\s\\S]*?<\\/select>`));
    assert.ok(match, `missing select #${id}`);
    return match[0];
  };
  const countSmsBowerOptions = (html) => (
    html.match(/<option\s+value="smsbower"[^>]*>SMSBower<\/option>/g) || []
  ).length;

  assert.equal(countSmsBowerOptions(extractSelect('select-phone-sms-provider')), 1);
  assert.equal(countSmsBowerOptions(extractSelect('select-phone-sms-provider-order')), 1);
});

test('sidepanel persists SMSBower settings separately from other providers', () => {
  assert.match(sidepanelJs, /smsBowerApiKey:\s*smsBowerApiKeyValue/);
  assert.match(sidepanelJs, /smsBowerCountryOrder:\s*smsBowerCountryOrderValue/);
  assert.match(sidepanelJs, /smsBowerServiceCode:\s*smsBowerServiceCodeValue/);
  assert.match(sidepanelJs, /activePhoneSmsProvider === PHONE_SMS_PROVIDER_SMSBOWER/);
  assert.match(sidepanelJs, /rowHostedSmsAuthPool\.style\.display\s*=\s*showSettings\s*&&\s*hostedSmsProvider/);
});

test('sidepanel never restores default SMSBower countries when applying explicit state', () => {
  const calls = extractFunctionCalls(sidepanelJs, 'applySmsBowerCountrySelection');
  assert.ok(calls.length >= 5, 'expected SMSBower country selection call sites');
  for (const call of calls) {
    assert.match(call, /ensureDefault:\s*false/, call);
  }
});

test('sidepanel does not show the generic phone API row for SMSBower', () => {
  assert.match(
    sidepanelJs,
    /const\s+heroLikeProvider\s*=\s*heroProvider\s*\|\|\s*smsVerificationNumberProvider\s*\|\|\s*grizzlySmsProvider\s*\|\|\s*smsPoolProvider/
  );
  assert.match(
    sidepanelJs,
    /rowHeroSmsApiKey\.style\.display\s*=\s*showSettings\s*&&\s*heroLikeProvider\s*\?\s*''\s*:\s*'none'/
  );
  assert.match(
    sidepanelJs,
    /rowSmsBowerApiKey\.style\.display\s*=\s*showSettings\s*&&\s*smsBowerProvider\s*\?\s*''\s*:\s*'none'/
  );
});

test('sidepanel SMSBower price preview uses a scoped price parser', () => {
  assert.match(sidepanelJs, /function\s+collectHandlerApiPriceEntriesForPreview\s*\(/);
  assert.match(sidepanelJs, /const\s+collectPriceEntries\s*=\s*collectHandlerApiPriceEntriesForPreview/);
  assert.match(sidepanelJs, /entry\.price\s*\?\?\s*entry\.cost/);
  assert.match(
    sidepanelJs,
    /if\s*\(provider === smsBowerProviderValue\)\s*{\s*const lines = await buildSmsBowerPricePreviewLines\(\{ providerLabel: 'SMSBower' \}\)/
  );
});

test('signup phone country selection trusts SMSBower country label dial code before phone digits', () => {
  assert.match(signupPageJs, /const\s+countryDialCode\s*=\s*extractDialCodeFromText\(countryText\)/);
  assert.match(signupPageJs, /if\s*\(countryDialCode\)\s*{\s*return\s+countryDialCode;\s*}/);
  const countryDialIndex = signupPageJs.indexOf('const countryDialCode = extractDialCodeFromText(countryText);');
  const optionDialIndex = signupPageJs.indexOf('const optionDialCode = extractDialCodeFromText(getSignupPhoneOptionLabel(targetOption));');
  assert.ok(countryDialIndex >= 0 && optionDialIndex > countryDialIndex);
  assert.match(signupPageJs, /byPhoneNumberDialCode\s*!==\s*countryDialCode\s*\?\s*null\s*:\s*byPhoneNumberCandidate/);
});

test('add-phone country selection rejects current country when SMSBower label dial code differs', () => {
  assert.match(phoneAuthJs, /function\s+resolveTargetDialCode\s*\(/);
  assert.match(phoneAuthJs, /const\s+targetDialCode\s*=\s*resolveTargetDialCode\(countryLabel,\s*phoneNumber\)/);
  assert.match(phoneAuthJs, /selectedDialCode\s*===\s*targetDialCode/);
  assert.match(phoneAuthJs, /byPhoneNumberDialCode\s*!==\s*targetDialCode\s*\?\s*null\s*:\s*byPhoneNumberCandidate/);
  assert.match(phoneAuthJs, /function\s+getVisibleCountryListboxOptions\s*\(/);
  assert.match(phoneAuthJs, /function\s+findCountryListboxOption\s*\(/);
  assert.match(phoneAuthJs, /function\s+trySelectCountryListboxOption\s*\(/);
  assert.match(phoneAuthJs, /simulateClick\(option\)/);
  assert.match(phoneAuthJs, /trySelectCountryListboxOption\(countryLabel,\s*phoneNumber\)/);
  assert.match(phoneAuthJs, /当前显示为 \$\{getCountryButtonText\(\) \|\| displayedDialCode \|\| '未知'\}/);
  assert.match(phoneVerificationFlowJs, /country\\s\+dial\\s\+code\\s\+mismatch/);
});

test('add-phone control lookup falls back when the page form has no add-phone action', () => {
  assert.match(phoneAuthJs, /function\s+getAddPhoneRoot\s*\(/);
  assert.match(phoneAuthJs, /getPhoneInputRootCandidate\s*\(\)/);
  assert.match(phoneAuthJs, /phoneInput\?\.closest\('form'\)/);
  assert.match(phoneAuthJs, /getAddPhoneForm\(\)\s*\|\|\s*getPhoneInputRootCandidate\(\)\s*\|\|\s*document/);
  assert.match(phoneAuthJs, /const\s+root\s*=\s*getAddPhoneRoot\(\)/);
});

test('Step9 continues an existing SMSBower preferred activation instead of creating another order', async () => {
  require('../background/phone-verification-flow.js');

  let requestActivationCalls = 0;
  const submittedPhones = [];
  const preferredActivation = {
    provider: 'smsbower',
    activationId: 'sb-existing-1',
    phoneNumber: '233501234567',
    countryId: 38,
    countryLabel: 'Ghana',
    serviceCode: 'dr',
    successfulUses: 0,
    maxUses: 1,
  };
  const state = {
    phoneSmsProvider: 'smsbower',
    smsBowerApiKey: 'test-key',
    smsBowerCountryOrder: [38],
    smsBowerServiceCode: 'dr',
    phonePreferredActivation: preferredActivation,
    currentPhoneActivation: null,
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
    createSmsBowerProvider: () => ({
      resolveCountryCandidates: () => [{ id: 38, label: 'Ghana' }],
      requestActivation: async () => {
        requestActivationCalls += 1;
        return {
          ...preferredActivation,
          activationId: 'sb-new-2',
          phoneNumber: '233509999999',
        };
      },
      pollActivationCode: async () => '123456',
      finishActivation: async () => 'ACCESS_ACTIVATION',
      cancelActivation: async () => 'ACCESS_CANCEL',
      banActivation: async () => 'ACCESS_CANCEL',
    }),
    sendToContentScriptResilient: async (_target, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPhones.push(message.payload.phoneNumber);
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

  assert.equal(requestActivationCalls, 0);
  assert.deepEqual(submittedPhones, ['233501234567']);
});

test('Step9 discards a persisted SMSBower activation whose dial code does not match its country', async () => {
  require('../background/phone-verification-flow.js');

  let requestActivationCalls = 0;
  const cancelledActivations = [];
  const submittedPhones = [];
  const badNigeriaActivation = {
    provider: 'smsbower',
    activationId: 'sb-bad-nigeria-1',
    phoneNumber: '2272347090',
    rawPhoneNumber: '+2272347090',
    countryId: 19,
    countryLabel: '尼日利亚 +234 (Nigeria)',
    serviceCode: 'dr',
    successfulUses: 0,
    maxUses: 1,
  };
  const state = {
    phoneSmsProvider: 'smsbower',
    smsBowerApiKey: 'test-key',
    smsBowerCountryOrder: [19, 38],
    smsBowerServiceCode: 'dr',
    currentPhoneActivation: badNigeriaActivation,
    phonePreferredActivation: badNigeriaActivation,
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
    createSmsBowerProvider: () => ({
      resolveCountryCandidates: () => [
        { id: 19, label: '尼日利亚 +234 (Nigeria)' },
        { id: 38, label: '加纳 +233 (Ghana)' },
      ],
      requestActivation: async () => {
        requestActivationCalls += 1;
        return {
          provider: 'smsbower',
          activationId: 'sb-ghana-2',
          phoneNumber: '233501234567',
          rawPhoneNumber: '+233501234567',
          countryId: 38,
          countryLabel: '加纳 +233 (Ghana)',
          serviceCode: 'dr',
          successfulUses: 0,
          maxUses: 1,
        };
      },
      pollActivationCode: async () => '123456',
      finishActivation: async () => 'ACCESS_ACTIVATION',
      cancelActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
      banActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
    }),
    sendToContentScriptResilient: async (_target, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPhones.push(message.payload.phoneNumber);
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

  assert.equal(requestActivationCalls, 1);
  assert.deepEqual(cancelledActivations, ['sb-bad-nigeria-1']);
  assert.deepEqual(submittedPhones, ['233501234567']);
});

test('Step9 cancels a newly fetched SMSBower activation whose dial code does not match before submit', async () => {
  require('../background/phone-verification-flow.js');

  let requestActivationCalls = 0;
  const blockedCountryOptions = [];
  const cancelledActivations = [];
  const submittedPhones = [];
  const state = {
    phoneSmsProvider: 'smsbower',
    smsBowerApiKey: 'test-key',
    smsBowerCountryOrder: [19, 38],
    smsBowerServiceCode: 'dr',
    currentPhoneActivation: null,
    phonePreferredActivation: null,
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
    createSmsBowerProvider: () => ({
      resolveCountryCandidates: () => [
        { id: 19, label: '尼日利亚 +234 (Nigeria)' },
        { id: 38, label: '加纳 +233 (Ghana)' },
      ],
      requestActivation: async (_state, options = {}) => {
        requestActivationCalls += 1;
        blockedCountryOptions.push(Array.isArray(options.blockedCountryIds) ? options.blockedCountryIds : []);
        if (requestActivationCalls === 1) {
          return {
            provider: 'smsbower',
            activationId: 'sb-new-bad-nigeria-1',
            phoneNumber: '22723470152',
            rawPhoneNumber: '+22723470152',
            countryId: 19,
            countryLabel: '尼日利亚 +234 (Nigeria)',
            serviceCode: 'dr',
            successfulUses: 0,
            maxUses: 1,
          };
        }
        return {
          provider: 'smsbower',
          activationId: 'sb-ghana-2',
          phoneNumber: '233501234567',
          rawPhoneNumber: '+233501234567',
          countryId: 38,
          countryLabel: '加纳 +233 (Ghana)',
          serviceCode: 'dr',
          successfulUses: 0,
          maxUses: 1,
        };
      },
      pollActivationCode: async () => '123456',
      finishActivation: async () => 'ACCESS_ACTIVATION',
      cancelActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
      banActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
    }),
    sendToContentScriptResilient: async (_target, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        submittedPhones.push(message.payload.phoneNumber);
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

  assert.equal(requestActivationCalls, 2);
  assert.deepEqual(blockedCountryOptions[0], []);
  assert.deepEqual(blockedCountryOptions[1], ['19']);
  assert.deepEqual(cancelledActivations, ['sb-new-bad-nigeria-1']);
  assert.deepEqual(submittedPhones, ['233501234567']);
});

test('Step9 skips SMSBower country after add-phone country dial mismatch', async () => {
  require('../background/phone-verification-flow.js');

  let requestActivationCalls = 0;
  const blockedCountryOptions = [];
  const cancelledActivations = [];
  const submittedPhones = [];
  const state = {
    phoneSmsProvider: 'smsbower',
    smsBowerApiKey: 'test-key',
    smsBowerCountryOrder: [19, 38],
    smsBowerServiceCode: 'dr',
    currentPhoneActivation: null,
    phonePreferredActivation: null,
    phoneVerificationReplacementLimit: 3,
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
    createSmsBowerProvider: () => ({
      resolveCountryCandidates: () => [
        { id: 19, label: '尼日利亚 +234 (Nigeria)' },
        { id: 38, label: '加纳 +233 (Ghana)' },
      ],
      requestActivation: async (_state, options = {}) => {
        requestActivationCalls += 1;
        blockedCountryOptions.push(Array.isArray(options.blockedCountryIds) ? options.blockedCountryIds : []);
        if (requestActivationCalls === 1) {
          return {
            provider: 'smsbower',
            activationId: 'sb-nigeria-openai-mismatch-1',
            phoneNumber: '2348154060862',
            rawPhoneNumber: '+2348154060862',
            countryId: 19,
            countryLabel: '尼日利亚 +234 (Nigeria)',
            serviceCode: 'dr',
            successfulUses: 0,
            maxUses: 1,
          };
        }
        return {
          provider: 'smsbower',
          activationId: 'sb-ghana-2',
          phoneNumber: '233501234567',
          rawPhoneNumber: '+233501234567',
          countryId: 38,
          countryLabel: '加纳 +233 (Ghana)',
          serviceCode: 'dr',
          successfulUses: 0,
          maxUses: 1,
        };
      },
      pollActivationCode: async () => '123456',
      finishActivation: async () => 'ACCESS_ACTIVATION',
      cancelActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
      banActivation: async (_state, activation) => {
        cancelledActivations.push(activation.activationId);
        return 'ACCESS_CANCEL';
      },
    }),
    sendToContentScriptResilient: async (_target, message) => {
      if (message.type === 'SUBMIT_PHONE_NUMBER') {
        if (message.payload.countryId === 19) {
          return {
            error: 'Add-phone country dial code mismatch: target +234 (尼日利亚 +234 (Nigeria)), 当前显示为 尼日尔 (+227)。',
          };
        }
        submittedPhones.push(message.payload.phoneNumber);
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
      if (message.type === 'RETURN_TO_ADD_PHONE') {
        return {
          addPhonePage: true,
          phoneVerificationPage: false,
          url: 'https://auth.openai.com/add-phone',
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

  assert.equal(requestActivationCalls, 2);
  assert.deepEqual(blockedCountryOptions[0], []);
  assert.deepEqual(blockedCountryOptions[1], ['19']);
  assert.deepEqual(cancelledActivations, ['sb-nigeria-openai-mismatch-1']);
  assert.deepEqual(submittedPhones, ['233501234567']);
});
