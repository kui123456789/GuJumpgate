const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');

test('plus checkout state exposes tax address error classification', () => {
  const source = fs.readFileSync(path.join(rootDir, 'content', 'plus-checkout.js'), 'utf8');

  assert.match(source, /invalid_customer_address_for_tax/);
  assert.match(source, /checkoutErrorText/);
  assert.match(source, /checkoutErrorCode/);
  assert.match(source, /customer'\?s\\s\+location\\s\+isn'\?t\\s\+recognized/i);
  assert.match(source, /set\\s\+a\\s\+valid\\s\+customer\\s\+address/i);
  assert.match(source, /calculate\\s\+tax/i);
  assert.match(source, /客户.*位置/);
  assert.match(source, /有效.*地址/);
  assert.match(source, /计算.*税/);
});

test('plus checkout billing refreshes address after tax address error', () => {
  const source = fs.readFileSync(path.join(rootDir, 'background', 'steps', 'fill-plus-checkout.js'), 'utf8');

  assert.match(source, /function\s+isInvalidCustomerAddressForTaxError\s*\(/);
  assert.match(source, /async\s+function\s+findCheckoutAddressTaxError\s*\(/);
  assert.match(source, /checkoutErrorCode\s*===\s*'invalid_customer_address_for_tax'/);
  assert.match(source, /检测到 checkout 地址无法用于税费计算，正在换一个账单地址重新填写/);
  assert.match(source, /forceOverwriteStructuredAddress/);
  assert.match(source, /overwriteStructuredAddress:\s*Boolean\([^)]*forceOverwriteStructuredAddress/s);
  assert.match(source, /await\s+fillBillingAddressWithFreshSeed\(\{\s*forceOverwriteStructuredAddress:\s*true/s);
  assert.match(
    source,
    /waitForPaymentRedirectAfterSubmit\(tabId,\s*paymentMethod\)[\s\S]{0,1600}findCheckoutAddressTaxError\(tabId/s,
    '提交后未跳转时应先读取 checkout 可见错误，再决定是否换地址'
  );
});
