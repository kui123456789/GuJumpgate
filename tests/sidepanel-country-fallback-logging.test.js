const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const sidepanelJs = fs.readFileSync(path.join(rootDir, 'sidepanel', 'sidepanel.js'), 'utf8');

test('sidepanel country list fallback does not emit extension warnings', () => {
  assert.doesNotMatch(
    sidepanelJs,
    /console\.warn\('加载 HeroSMS 国家列表失败：'/,
    'HeroSMS 国家接口失败已有内置国家列表兜底，不应在 Chrome 扩展错误页产生 warning'
  );
  assert.doesNotMatch(
    sidepanelJs,
    /console\.warn\('加载 5sim 国家列表失败：'/,
    '5sim 国家接口失败已有内置国家列表兜底，不应在 Chrome 扩展错误页产生 warning'
  );
  assert.doesNotMatch(
    sidepanelJs,
    /console\.error\('加载 HeroSMS 国家列表失败：'/,
    'HeroSMS 国家列表初始化兜底失败不应在 Chrome 扩展错误页产生 error'
  );
  assert.doesNotMatch(
    sidepanelJs,
    /console\.error\('加载 5sim 国家列表失败：'/,
    '5sim 国家列表初始化兜底失败不应在 Chrome 扩展错误页产生 error'
  );
});
