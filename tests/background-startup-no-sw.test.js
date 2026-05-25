const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const rootDir = path.resolve(__dirname, '..');
const backgroundJs = fs.readFileSync(path.join(rootDir, 'background.js'), 'utf8');

test('background startup suppresses transient No SW errors', () => {
  assert.match(
    backgroundJs,
    /function\s+isTransientNoServiceWorkerError\s*\(/,
    '后台应识别 Chrome 扩展刷新时的 transient No SW 错误'
  );
  assert.match(
    backgroundJs,
    /handleBackgroundStartupError\('restore auto run timer'/,
    '自动运行定时器恢复失败应走统一启动错误处理'
  );
  assert.match(
    backgroundJs,
    /chrome\.sidePanel\.setPanelBehavior\(\{ openPanelOnActionClick: true \}\)\.catch/,
    'sidePanel setPanelBehavior 返回 Promise，必须捕获 transient No SW'
  );
  assert.doesNotMatch(
    backgroundJs,
    /console\.error\(LOG_PREFIX,\s*'Failed to restore auto run timer:/,
    '普通启动路径不应直接把 transient No SW 记为扩展错误'
  );
});
