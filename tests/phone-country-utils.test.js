const assert = require('node:assert/strict');
const test = require('node:test');

require('../content/phone-country-utils.js');

const utils = globalThis.MultiPagePhoneCountryUtils;

test('country label matching does not confuse Niger with Nigeria', () => {
  const nigerOnly = [
    { textContent: 'Niger', label: 'Niger', value: 'NE' },
  ];
  assert.equal(
    utils.findOptionByCountryLabel(nigerOnly, '尼日利亚 +234 (Nigeria)'),
    null
  );

  const withNigeria = [
    { textContent: 'Niger', label: 'Niger', value: 'NE' },
    { textContent: 'Nigeria', label: 'Nigeria', value: 'NG' },
  ];
  assert.equal(
    utils.findOptionByCountryLabel(withNigeria, '尼日利亚 +234 (Nigeria)'),
    withNigeria[1]
  );
});
