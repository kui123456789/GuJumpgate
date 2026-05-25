const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.css'), 'utf8');

test('sidepanel exposes hosted SMS provider controls', () => {
  assert.match(
    sidepanelHtml,
    /<span\s+class="section-label">手机号验证接码<\/span>/,
    '接码配置区标题应明确标出手机号验证用途'
  );
  assert.match(
    sidepanelHtml,
    /<option\s+value="hosted-sms">托管短信接口<\/option>/,
    '接码服务商下拉中应包含托管短信接口'
  );
  assert.match(
    sidepanelHtml,
    /id="row-hosted-sms-auth-pool"/,
    'Auth 手机验证应有独立托管号码池配置行'
  );
  assert.match(
    sidepanelHtml,
    /id="row-hosted-sms-auth-verification-url"/,
    'Auth 手机验证应有独立验证码接口配置行'
  );
  assert.match(
    sidepanelHtml,
    /id="input-hosted-sms-auth-verification-url"/,
    'Auth 手机验证应有独立验证码接口输入框'
  );
  assert.match(
    sidepanelHtml,
    /id="row-hosted-sms-auth-phone"/,
    'Auth 手机验证应有独立手机号配置行'
  );
  assert.match(
    sidepanelHtml,
    /id="input-hosted-sms-auth-phone"/,
    'Auth 手机验证应有单独的手机号输入框'
  );
  assert.match(
    sidepanelHtml,
    /手机号\(不带\+1\)/,
    '手机号行应沿用 PayPal 配置的本地号提示方式'
  );
  assert.match(
    sidepanelHtml,
    /id="input-hosted-sms-auth-pool"/,
    'Auth 手机验证应保留独立托管号码池输入框'
  );
  assert.doesNotMatch(
    sidepanelHtml,
    /id="btn-add-hosted-sms-auth-entry"/,
    'Auth 手机验证不应使用和 PayPal 旧布局不一致的内联添加按钮'
  );
});

test('sidepanel renders PayPal-style hosted SMS auth pool manager', () => {
  [
    'btn-toggle-hosted-sms-auth-pool',
    'hosted-sms-auth-pool-shell',
    'input-hosted-sms-auth-pool-import',
    'btn-hosted-sms-auth-pool-refresh',
    'btn-hosted-sms-auth-pool-clear-used',
    'btn-hosted-sms-auth-pool-delete-all',
    'btn-hosted-sms-auth-pool-import',
    'hosted-sms-auth-pool-summary',
    'input-hosted-sms-auth-pool-search',
    'select-hosted-sms-auth-pool-filter',
    'hosted-sms-auth-pool-list',
  ].forEach((id) => {
    assert.match(
      sidepanelHtml,
      new RegExp(`id="${id}"`),
      `Auth 手机验证号池应包含 ${id}`
    );
  });

  assert.match(
    sidepanelHtml,
    /<textarea\s+id="input-hosted-sms-auth-pool"[^>]*hidden/,
    'Auth 手机验证应保留隐藏 textarea 用于保存 hostedSmsPoolText'
  );
  assert.match(
    sidepanelHtml,
    /<span\s+class="section-label">托管短信号池<\/span>/,
    'Auth 手机验证号池标题应与 PayPal 号池管理器一致可见'
  );
});

test('sidepanel does not globally hide phone verification settings', () => {
  assert.doesNotMatch(
    sidepanelCss,
    /#phone-verification-section\s*\{[^}]*display\s*:\s*none\s*!important/i,
    '接码设置卡片不能被 CSS 全局隐藏'
  );
  assert.doesNotMatch(
    sidepanelCss,
    /#ip-proxy-section\s*,\s*#phone-verification-section\s*\{[^}]*display\s*:\s*none\s*!important/i,
    '接码设置卡片不能和代理设置一起被 CSS 全局隐藏'
  );
});

test('sidepanel moves phone verification settings into the visible main settings area', () => {
  assert.match(
    sidepanelJs,
    /function\s+placePhoneVerificationSectionNearMainSettings\s*\(/,
    '应在侧边栏加载时调整接码设置位置'
  );
  assert.match(
    sidepanelJs,
    /settingsCard\.insertBefore\(phoneVerificationSection,\s*mailProviderRow\)/,
    '接码设置应插入到邮箱服务前，避免掉到主设置卡片后面'
  );
  assert.match(
    sidepanelCss,
    /#settings-card\s*>\s*#phone-verification-section\.module-divider-start/,
    '接码设置移动进主设置区后应保留模块分隔样式'
  );
});

test('sidepanel shows hosted SMS controls from the current dropdown selection', () => {
  const functionMatch = sidepanelJs.match(
    /function\s+resolveNormalizedProviderOrderForRuntime\s*\([^)]*\)\s*\{[\s\S]*?\n\}/
  );
  assert.ok(functionMatch, '应能找到 resolveNormalizedProviderOrderForRuntime');

  assert.match(
    functionMatch[0],
    /selectPhoneSmsProvider\?\.value\s*\|\|\s*state\?\.phoneSmsProvider/,
    '显示接码设置时应优先读取当前下拉值，而不是被旧 latestState 覆盖'
  );
});

test('sidepanel allows editing phone verification settings before enabling the runtime switch', () => {
  assert.match(
    sidepanelJs,
    /const\s+showSettings\s*=\s*canShowPhoneSettings\s*&&\s*phoneVerificationSectionExpanded/,
    '接码配置区应允许先展开编辑，不能依赖手机号验证开关已开启'
  );
  assert.match(
    sidepanelJs,
    /btnTogglePhoneVerificationSection\.disabled\s*=\s*!canShowPhoneSettings/,
    '展开设置按钮只应受流程能力控制，不能因接码开关关闭而禁用'
  );
  assert.doesNotMatch(
    sidepanelJs,
    /const\s+showSettings\s*=\s*enabled\s*&&\s*phoneVerificationSectionExpanded/,
    '关闭手机号验证开关时仍应能看到并编辑托管短信配置'
  );
});

test('sidepanel opens phone verification settings by default after extension reload', () => {
  assert.match(
    sidepanelJs,
    /const\s+PHONE_VERIFICATION_SECTION_COLLAPSED_VALUE\s*=\s*'0'/,
    '应使用显式收起标记，避免无本地记录时默认隐藏配置'
  );
  assert.match(
    sidepanelJs,
    /return\s+savedValue\s*!==\s*PHONE_VERIFICATION_SECTION_COLLAPSED_VALUE/,
    '无本地收起记录时，手机号验证接码配置应默认展开'
  );
});

test('sidepanel wires hosted SMS standalone fields into saved pool text', () => {
  assert.match(
    sidepanelJs,
    /const\s+inputHostedSmsAuthPhone\s*=\s*document\.getElementById\('input-hosted-sms-auth-phone'\)/,
    '应读取托管短信手机号输入框'
  );
  assert.match(
    sidepanelJs,
    /const\s+inputHostedSmsAuthVerificationUrl\s*=\s*document\.getElementById\('input-hosted-sms-auth-verification-url'\)/,
    '应读取托管短信接口 URL 输入框'
  );
  assert.match(
    sidepanelJs,
    /function\s+collectHostedSmsAuthPoolTextValue\s*\(/,
    '保存配置时应把独立手机号和接口 URL 合成为号码池文本'
  );
  assert.match(
    sidepanelJs,
    /function\s+applyHostedSmsAuthPoolText\s*\(/,
    '恢复配置时应从号码池回填独立手机号和接口 URL'
  );
});

test('sidepanel wires hosted SMS auth pool manager to auth storage keys', () => {
  assert.match(
    sidepanelJs,
    /const\s+authHostedSmsPoolManager\s*=\s*window\.SidepanelHostedSmsPoolManager\?\.createHostedSmsPoolManager/,
    'Auth 手机验证应创建独立托管短信号池 manager'
  );
  assert.match(
    sidepanelJs,
    /getText:\s*\(\)\s*=>\s*normalizeHostedSmsPoolTextValue\(inputHostedSmsAuthPool\?\.value\s*\|\|\s*latestState\?\.hostedSmsPoolText\s*\|\|\s*''\)/,
    'Auth 号池 manager 应读取 hostedSmsPoolText，而不是 PayPal hosted checkout 号池'
  );
  assert.match(
    sidepanelJs,
    /syncLatestState\(\{\s*hostedSmsPoolText:\s*normalized\s*\}\)/,
    'Auth 号池 manager 应写入 hostedSmsPoolText'
  );
  assert.match(
    sidepanelJs,
    /getUsage:\s*\(\)\s*=>\s*latestState\?\.hostedSmsPoolUsage\s*\|\|\s*\{\}/,
    'Auth 号池 manager 应读取 hostedSmsPoolUsage'
  );
  assert.match(
    sidepanelJs,
    /getCurrentEntry:\s*\(\)\s*=>\s*latestState\?\.hostedSmsCurrentEntry\s*\|\|\s*null/,
    'Auth 号池 manager 应读取 hostedSmsCurrentEntry'
  );
});

test('sidepanel hides API-key price and balance controls for hosted SMS auth provider', () => {
  assert.match(
    sidepanelJs,
    /const\s+phoneSmsProviderHasPriceControls\s*=\s*heroProvider\s*\|\|\s*fiveSimProvider\s*\|\|\s*nexSmsProvider/,
    '托管短信接口不应被归入需要 API Key 的查价/余额服务商'
  );
  assert.match(
    sidepanelJs,
    /rowHeroSmsMaxPrice\.style\.display\s*=\s*showSettings\s*&&\s*phoneSmsProviderHasPriceControls\s*\?\s*''\s*:\s*'none'/,
    '选择 hosted-sms 时应隐藏价格区间、查询价格和查余额区域'
  );
  assert.match(
    sidepanelJs,
    /托管短信接口不需要查询平台价格/,
    '托管短信接口触发查价时不应提示填写接码 API Key'
  );
  assert.match(
    sidepanelJs,
    /托管短信接口不需要查询平台余额/,
    '托管短信接口触发查余额时不应提示填写接码 API Key'
  );
});
