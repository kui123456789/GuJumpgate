const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');
const sidepanelHtml = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.html'), 'utf8');
const sidepanelCss = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.css'), 'utf8');
const backgroundJs = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');
const customEmailPoolManagerJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'custom-email-pool-manager.js'), 'utf8');

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

test('sidepanel exposes selectable Plus payment methods', () => {
  const selectMatch = sidepanelHtml.match(/<select[^>]+id="select-plus-payment-method"[^>]*>[\s\S]*?<\/select>/);
  assert.ok(selectMatch, '应能找到 Plus 支付方式下拉框');

  const selectHtml = selectMatch[0];
  assert.doesNotMatch(selectHtml, /\sdisabled(?:\s|>|=)/, 'Plus 支付方式下拉框不能被禁用');
  assert.match(selectHtml, /<option\s+value="paypal">PayPal<\/option>/, '应保留 PayPal 选项');
  assert.match(selectHtml, /<option\s+value="gopay">GoPay<\/option>/, '应提供 GoPay 选项');
  assert.match(selectHtml, /<option\s+value="gpc-helper">GPC Helper<\/option>/, '应提供 GPC Helper 选项');
  assert.match(selectHtml, /<option\s+value="pix">Pix<\/option>/, '应提供 Pix 选项');
  assert.match(
    sidepanelJs,
    /function\s+normalizePlusPaymentMethod[\s\S]*?normalized\s*===\s*PLUS_PAYMENT_METHOD_GOPAY[\s\S]*?normalized\s*===\s*PLUS_PAYMENT_METHOD_GPC_HELPER[\s\S]*?normalized\s*===\s*PLUS_PAYMENT_METHOD_PIX[\s\S]*?PLUS_PAYMENT_METHOD_PAYPAL/,
    'normalizePlusPaymentMethod 应允许 GoPay、GPC Helper 和 Pix，而不是总是回退 PayPal'
  );
});

test('sidepanel exposes Pix redeem settings only for Pix payment', () => {
  [
    'row-pix-redeem-api-base-url',
    'input-pix-redeem-api-base-url',
    'row-pix-redeem-external-api-key',
    'input-pix-redeem-external-api-key',
    'btn-toggle-pix-redeem-external-api-key',
    'row-pix-redeem-client-id',
    'input-pix-redeem-client-id',
    'row-pix-redeem-stop-after-redeem',
    'input-pix-redeem-stop-after-redeem',
    'row-pix-redeem-cdkey-pool',
    'input-pix-redeem-cdkey-pool',
    'pix-redeem-cdkey-pool-summary',
    'pix-redeem-cdkey-status-list',
  ].forEach((id) => {
    assert.match(sidepanelHtml, new RegExp(`id="${id}"`), `Pix 设置应包含 ${id}`);
  });

  assert.match(
    sidepanelJs,
    /const\s+pixRowsVisible\s*=\s*enabled\s*&&\s*selectedMethod\s*===\s*pixValue/,
    'Pix 配置行应只在 Plus Pix 支付方式下显示'
  );
  assert.match(
    sidepanelJs,
    /rowPixRedeemApiBaseUrl[\s\S]*?rowPixRedeemExternalApiKey[\s\S]*?rowPixRedeemCdkeyPool[\s\S]*?pixRowsVisible\s*\?\s*''\s*:\s*'none'/,
    'Pix API、Key、卡密池行应统一跟随 pixRowsVisible 显示/隐藏'
  );
  assert.match(
    sidepanelHtml,
    /兑换后停止[\s\S]*不执行后续 OAuth/,
    'Pix 设置应提供兑换后停止的选择'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemStopAfterRedeem:\s*Boolean\(inputPixRedeemStopAfterRedeem\?\.checked\)/,
    '保存配置时应写入 Pix 兑换后停止开关'
  );
  assert.match(
    sidepanelJs,
    /inputPixRedeemStopAfterRedeem\.checked\s*=\s*state\?\.pixRedeemContinueAfterRedeem\s*===\s*true\s*\?\s*false\s*:\s*true/,
    '恢复配置时应默认勾选 Pix 兑换后停止，只有明确继续后链才取消'
  );
  assert.match(
    sidepanelJs,
    /let\s+currentPixRedeemStopAfterRedeem\s*=\s*true/,
    '侧栏步骤预览应默认按 Pix 第 6 步后停止'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemContinueAfterRedeem:\s*!Boolean\(inputPixRedeemStopAfterRedeem\?\.checked\)/,
    '保存配置时应写入是否继续 Pix 后续 OAuth 后链'
  );
  assert.match(
    backgroundJs,
    /pixRedeemStopAfterRedeem:\s*true/,
    '后台持久化默认值应按 Pix 第 6 步后停止'
  );
  assert.match(
    backgroundJs,
    /pixRedeemContinueAfterRedeem:\s*false/,
    '后台默认不继续 Pix 后续 OAuth 后链'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemApiBaseUrl:\s*String\(inputPixRedeemApiBaseUrl\?\.value\s*\|\|\s*''\)\.trim\(\)/,
    '保存配置时应写入 Pix API Base URL'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemExternalApiKey:\s*String\(inputPixRedeemExternalApiKey\?\.value\s*\|\|\s*''\)\.trim\(\)/,
    '保存配置时应写入 Pix External API Key'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemClientId:\s*String\(inputPixRedeemClientId\?\.value\s*\|\|\s*''\)\.trim\(\)/,
    '保存配置时应写入 Pix Client ID'
  );
  assert.match(
    sidepanelJs,
    /pixRedeemCdkeyPoolText:\s*normalizePixRedeemCdkeyPoolTextValue\(inputPixRedeemCdkeyPool\?\.value\s*\|\|\s*''\)/,
    '保存配置时应写入规范化后的 Pix 卡密池'
  );
  assert.match(
    sidepanelJs,
    /enabled:\s*item\.enabled\s*!==\s*false/,
    'Pix 卡密 usage 应持久化启用状态，旧数据默认启用'
  );
  assert.match(
    sidepanelJs,
    /renderPixRedeemCdkeyStatusList/,
    'Pix 卡密池应渲染可操作的启用/已用状态列表'
  );
  assert.match(
    sidepanelHtml,
    /启用[\s\S]*已用/,
    'Pix 卡密池 UI 应展示启用和已用状态'
  );
  assert.match(
    sidepanelJs,
    /function\s+markPixRedeemCdkeyUnused/,
    'Pix 已用卡密应提供设为未用动作'
  );
  assert.match(
    sidepanelJs,
    /usedAt:\s*0[\s\S]*lastError:\s*''/,
    '设为未用时应清空 usedAt 和上次错误'
  );
  assert.match(
    sidepanelJs,
    /pix-redeem-cdkey-status-action[\s\S]*设为未用/,
    '已用状态应渲染为可点击的设为未用按钮'
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

test('sidepanel custom email pool accepts verification URL entries', () => {
  assert.match(
    sidepanelHtml,
    /邮箱----取码URL/,
    '自定义邮箱池输入提示应说明支持 邮箱----取码URL'
  );
  assert.match(
    sidepanelJs,
    /verificationUrl/,
    '侧栏保存的 customEmailPoolEntries 应保留 verificationUrl 字段'
  );
  assert.match(
    customEmailPoolManagerJs,
    /verificationUrl/,
    '自定义邮箱池管理器应解析并展示 verificationUrl'
  );
  assert.match(
    sidepanelHtml,
    /搜索邮箱 \/ 备注 \/ 取码URL/,
    '自定义邮箱池搜索提示应包含取码 URL'
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
