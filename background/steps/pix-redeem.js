(function attachBackgroundPixRedeem(root, factory) {
  root.MultiPageBackgroundPixRedeem = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundPixRedeemModule() {
  const CHATGPT_SOURCE = 'plus-checkout';
  const CHATGPT_INJECT_FILES = ['content/utils.js', 'content/operation-delay.js', 'content/plus-checkout.js'];
  const SESSION_TAB_COMPLETE_TIMEOUT_MS = 60000;
  const SESSION_CONTENT_READY_TIMEOUT_MS = 45000;
  const SESSION_READ_MESSAGE_TIMEOUT_MS = 30000;
  const SESSION_READ_RESPONSE_TIMEOUT_MS = 15000;
  const PIX_REDEEM_TIMEOUT_MS = 45000;

  function createPixRedeemExecutor(deps = {}) {
    const {
      addLog: rawAddLog = async () => {},
      chrome,
      completeNodeFromBackground,
      ensureContentScriptReadyOnTabUntilStopped = async () => {},
      fetchImpl = (typeof fetch === 'function' ? fetch.bind(globalThis) : null),
      getState = async () => ({}),
      getTabId,
      isTabAlive,
      now = () => Date.now(),
      registerTab,
      sendTabMessageUntilStopped,
      setState = async () => {},
      sleepWithStop = async () => {},
      throwIfStopped = () => {},
      waitForTabCompleteUntilStopped = async () => {},
    } = deps;

    function normalizeString(value = '') {
      return String(value || '').trim();
    }

    function getErrorMessage(error) {
      return normalizeString(error?.message || error);
    }

    function addStepLog(step, message, level = 'info') {
      return rawAddLog(message, level, {
        step,
        stepKey: 'pix-redeem',
      });
    }

    function resolveVisibleStep(state = {}) {
      const visibleStep = Math.floor(Number(state?.visibleStep) || 0);
      return visibleStep > 0 ? visibleStep : 6;
    }

    async function getMergedState(state = {}) {
      const latestState = typeof getState === 'function'
        ? await getState().catch(() => ({}))
        : {};
      return {
        ...(latestState || {}),
        ...(state || {}),
      };
    }

    function normalizePixRedeemApiBaseUrl(value = '') {
      let normalized = normalizeString(value).replace(/\/+$/g, '');
      normalized = normalized.replace(/\/api\/external\/cdkey-redeems$/i, '');
      return normalized.replace(/\/+$/g, '');
    }

    function buildPixRedeemApiUrl(value = '') {
      const baseUrl = normalizePixRedeemApiBaseUrl(value);
      if (!baseUrl) {
        throw new Error('Pix API Base URL 未配置，请先在侧边栏填写 Pix API 地址。');
      }
      try {
        const parsed = new URL(baseUrl);
        if (!/^https?:$/i.test(parsed.protocol)) {
          throw new Error('Pix API Base URL 只支持 http/https。');
        }
      } catch (error) {
        throw new Error(`Pix API Base URL 格式无效：${getErrorMessage(error) || baseUrl}`);
      }
      return `${baseUrl}/api/external/cdkey-redeems`;
    }

    function parseCdkeyPoolText(value = '') {
      const seen = new Set();
      return String(value || '')
        .replace(/\r/g, '')
        .split('\n')
        .map((line) => normalizeString(line))
        .filter((line) => {
          if (!line || seen.has(line)) {
            return false;
          }
          seen.add(line);
          return true;
        });
    }

    function normalizePixRedeemCdkeyUsage(rawUsage = {}) {
      const usage = (rawUsage && typeof rawUsage === 'object' && !Array.isArray(rawUsage))
        ? rawUsage
        : {};
      const result = {};
      Object.entries(usage).forEach(([rawCdkey, rawEntry]) => {
        const cdkey = normalizeString(rawCdkey);
        if (!cdkey) {
          return;
        }
        const entry = (rawEntry && typeof rawEntry === 'object' && !Array.isArray(rawEntry))
          ? rawEntry
          : {};
        result[cdkey] = {
          usedAt: Math.max(0, Math.floor(Number(entry.usedAt) || 0)),
          lastAttemptAt: Math.max(0, Math.floor(Number(entry.lastAttemptAt) || 0)),
          lastError: normalizeString(entry.lastError),
        };
      });
      return result;
    }

    function pickFirstUnusedCdkey(cdkeys = [], usage = {}) {
      return cdkeys.find((cdkey) => !Number(usage?.[cdkey]?.usedAt)) || '';
    }

    async function updateCdkeyUsage(cdkey, updater) {
      const state = await getMergedState({});
      const usage = normalizePixRedeemCdkeyUsage(state?.pixRedeemCdkeyUsage || {});
      const currentEntry = usage[cdkey] || { usedAt: 0, lastAttemptAt: 0, lastError: '' };
      const nextEntry = updater(currentEntry) || currentEntry;
      await setState({
        pixRedeemCdkeyUsage: {
          ...usage,
          [cdkey]: {
            usedAt: Math.max(0, Math.floor(Number(nextEntry.usedAt) || 0)),
            lastAttemptAt: Math.max(0, Math.floor(Number(nextEntry.lastAttemptAt) || 0)),
            lastError: normalizeString(nextEntry.lastError),
          },
        },
      });
    }

    function isSupportedChatGptSessionUrl(url = '') {
      try {
        const parsed = new URL(String(url || ''));
        if (!/^https?:$/i.test(parsed.protocol)) {
          return false;
        }
        const hostname = normalizeString(parsed.hostname).toLowerCase();
        return /(^|\.)chatgpt\.com$/.test(hostname)
          || hostname === 'chat.openai.com'
          || /(^|\.)openai\.com$/.test(hostname);
      } catch {
        return false;
      }
    }

    function getSessionTabHostPriority(url = '') {
      try {
        const hostname = normalizeString(new URL(String(url || '')).hostname).toLowerCase();
        if (/(^|\.)chatgpt\.com$/.test(hostname)) {
          return 0;
        }
        if (hostname === 'chat.openai.com') {
          return 1;
        }
        if (/(^|\.)openai\.com$/.test(hostname)) {
          return 2;
        }
      } catch {
        return Number.POSITIVE_INFINITY;
      }
      return Number.POSITIVE_INFINITY;
    }

    function getSessionTabActivityPriority(tab = {}) {
      if (tab?.active && tab?.currentWindow) {
        return 0;
      }
      if (tab?.active) {
        return 1;
      }
      return 2;
    }

    function pickPreferredSessionTab(tabs = []) {
      const candidates = (Array.isArray(tabs) ? tabs : [])
        .filter((tab) => Number.isInteger(tab?.id) && isSupportedChatGptSessionUrl(tab.url));
      if (!candidates.length) {
        return null;
      }
      return candidates.reduce((best, candidate) => {
        if (!best) {
          return candidate;
        }
        const candidateHostPriority = getSessionTabHostPriority(candidate.url);
        const bestHostPriority = getSessionTabHostPriority(best.url);
        if (candidateHostPriority !== bestHostPriority) {
          return candidateHostPriority < bestHostPriority ? candidate : best;
        }
        const candidateActivityPriority = getSessionTabActivityPriority(candidate);
        const bestActivityPriority = getSessionTabActivityPriority(best);
        if (candidateActivityPriority !== bestActivityPriority) {
          return candidateActivityPriority < bestActivityPriority ? candidate : best;
        }
        const candidateLastAccessed = Number(candidate?.lastAccessed) || 0;
        const bestLastAccessed = Number(best?.lastAccessed) || 0;
        if (candidateLastAccessed !== bestLastAccessed) {
          return candidateLastAccessed > bestLastAccessed ? candidate : best;
        }
        return Number(candidate.id) < Number(best.id) ? candidate : best;
      }, null);
    }

    async function readSupportedSessionTab(tabId) {
      const numericTabId = Number(tabId) || 0;
      if (!numericTabId || !chrome?.tabs?.get) {
        return null;
      }
      const tab = await chrome.tabs.get(numericTabId).catch(() => null);
      return tab?.id && isSupportedChatGptSessionUrl(tab.url) ? tab : null;
    }

    async function findFallbackSessionTab() {
      if (!chrome?.tabs?.query) {
        return null;
      }
      const activeTabs = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
      const activeMatch = pickPreferredSessionTab(activeTabs);
      const allTabs = await chrome.tabs.query({}).catch(() => []);
      const globalMatch = pickPreferredSessionTab(allTabs);
      return pickPreferredSessionTab([activeMatch, globalMatch]);
    }

    async function resolveSessionTabId(state = {}) {
      const registeredTabId = typeof getTabId === 'function'
        ? await getTabId(CHATGPT_SOURCE)
        : null;
      if (registeredTabId && typeof isTabAlive === 'function' && await isTabAlive(CHATGPT_SOURCE)) {
        const registeredTab = await readSupportedSessionTab(registeredTabId);
        if (registeredTab?.id) {
          return registeredTab.id;
        }
      }

      const storedTabId = Number(state?.plusCheckoutTabId) || 0;
      const storedTab = await readSupportedSessionTab(storedTabId);
      if (storedTab?.id) {
        if (typeof registerTab === 'function') {
          await registerTab(CHATGPT_SOURCE, storedTab.id);
        }
        return storedTab.id;
      }

      const fallbackTab = await findFallbackSessionTab();
      if (fallbackTab?.id) {
        if (typeof registerTab === 'function') {
          await registerTab(CHATGPT_SOURCE, fallbackTab.id);
        }
        return fallbackTab.id;
      }

      throw new Error('未找到可读取 ChatGPT session 的标签页，请先打开已登录的 ChatGPT / OpenAI 页面。');
    }

    async function getResolvedSessionTab(tabId, visibleStep) {
      const tab = await chrome?.tabs?.get?.(tabId).catch(() => null);
      if (!tab?.id) {
        throw new Error(`步骤 ${visibleStep}：ChatGPT session 标签页不存在或已关闭，无法执行 Pix 卡密兑换。`);
      }
      if (!isSupportedChatGptSessionUrl(tab.url)) {
        throw new Error(`步骤 ${visibleStep}：当前标签页不在 ChatGPT / OpenAI 页面，无法读取 accessToken。`);
      }
      return tab;
    }

    async function readSessionWithContentMessage(tabId) {
      if (typeof sendTabMessageUntilStopped !== 'function') {
        return null;
      }
      const sessionResult = await sendTabMessageUntilStopped(tabId, CHATGPT_SOURCE, {
        type: 'PLUS_CHECKOUT_GET_STATE',
        source: 'background',
        payload: {
          includeSession: true,
          includeAccessToken: true,
        },
      }, {
        timeoutMs: SESSION_READ_MESSAGE_TIMEOUT_MS,
        responseTimeoutMs: SESSION_READ_RESPONSE_TIMEOUT_MS,
        retryDelayMs: 300,
      });
      if (sessionResult?.error) {
        throw new Error(sessionResult.error);
      }
      return sessionResult || null;
    }

    async function readSessionWithScripting(tabId) {
      if (!chrome?.scripting?.executeScript) {
        return null;
      }
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          const response = await fetch('/api/auth/session', {
            credentials: 'include',
            cache: 'no-store',
          });
          const session = await response.json().catch(() => null);
          return {
            ok: response.ok,
            status: response.status,
            session,
            accessToken: session?.accessToken || session?.access_token || '',
          };
        },
      }).catch((error) => {
        throw new Error(`读取 /api/auth/session 失败：${error?.message || error}`);
      });
      const firstResult = Array.isArray(results) ? results[0]?.result : null;
      if (!firstResult) {
        return null;
      }
      if (firstResult.ok === false) {
        throw new Error(`/api/auth/session 请求失败（HTTP ${firstResult.status || 0}）。`);
      }
      return firstResult;
    }

    async function readCurrentChatGptSession(tabId, visibleStep) {
      await waitForTabCompleteUntilStopped(tabId, {
        timeoutMs: SESSION_TAB_COMPLETE_TIMEOUT_MS,
        retryDelayMs: 300,
      });
      await sleepWithStop(500);
      await ensureContentScriptReadyOnTabUntilStopped(CHATGPT_SOURCE, tabId, {
        inject: CHATGPT_INJECT_FILES,
        injectSource: CHATGPT_SOURCE,
        timeoutMs: SESSION_CONTENT_READY_TIMEOUT_MS,
        retryDelayMs: 700,
        logMessage: `步骤 ${visibleStep}：正在等待 ChatGPT 会话页完成加载，再继续读取 Pix 兑换 accessToken...`,
      });

      const sessionResult = await readSessionWithContentMessage(tabId)
        || await readSessionWithScripting(tabId);
      const session = sessionResult?.session && typeof sessionResult.session === 'object' && !Array.isArray(sessionResult.session)
        ? sessionResult.session
        : null;
      const accessToken = normalizeString(
        sessionResult?.accessToken
        || sessionResult?.access_token
        || session?.accessToken
        || session?.access_token
      );
      if (!accessToken) {
        throw new Error(`步骤 ${visibleStep}：未读取到 ChatGPT accessToken，请确认当前 ChatGPT / OpenAI 标签页仍处于已登录状态。`);
      }
      return {
        session,
        accessToken,
      };
    }

    async function readResponseBody(response) {
      if (!response) {
        return null;
      }
      if (typeof response.text === 'function') {
        const text = await response.text();
        if (!normalizeString(text)) {
          return null;
        }
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
      if (typeof response.json === 'function') {
        return response.json().catch(() => null);
      }
      return null;
    }

    function getPayloadError(payload) {
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return '';
      }
      if (payload.ok === false || payload.success === false) {
        return normalizeString(payload.error || payload.message || 'Pix 兑换接口返回失败。');
      }
      if (payload.error) {
        return typeof payload.error === 'string'
          ? normalizeString(payload.error)
          : JSON.stringify(payload.error);
      }
      if (Array.isArray(payload.errors) && payload.errors.length) {
        return JSON.stringify(payload.errors);
      }
      const status = normalizeString(payload.status).toLowerCase();
      if (['error', 'failed', 'failure'].includes(status)) {
        return normalizeString(payload.message || payload.status);
      }
      return '';
    }

    async function postPixRedeem({ apiUrl, externalApiKey, cdkey, accessToken }) {
      if (typeof fetchImpl !== 'function') {
        throw new Error('当前运行环境不支持 fetch，无法请求 Pix 兑换接口。');
      }
      const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timeoutId = controller
        ? setTimeout(() => controller.abort(), PIX_REDEEM_TIMEOUT_MS)
        : null;
      try {
        const response = await fetchImpl(apiUrl, {
          method: 'POST',
          headers: {
            'X-External-Api-Key': externalApiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            items: [{ cdkey, access_token: accessToken }],
          }),
          ...(controller ? { signal: controller.signal } : {}),
        });
        const payload = await readResponseBody(response);
        if (!response?.ok) {
          const payloadError = getPayloadError(payload);
          throw new Error(`Pix 兑换接口请求失败（HTTP ${response?.status || 0}）${payloadError ? `：${payloadError}` : ''}`);
        }
        const payloadError = getPayloadError(payload);
        if (payloadError) {
          throw new Error(`Pix 兑换接口返回错误：${payloadError}`);
        }
        return payload;
      } catch (error) {
        if (error?.name === 'AbortError') {
          throw new Error('Pix 兑换接口请求超时。');
        }
        throw error;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    }

    async function executePixRedeem(state = {}) {
      throwIfStopped();
      const runtimeState = await getMergedState(state);
      const visibleStep = resolveVisibleStep(runtimeState);
      const apiUrl = buildPixRedeemApiUrl(runtimeState?.pixRedeemApiBaseUrl);
      const externalApiKey = normalizeString(runtimeState?.pixRedeemExternalApiKey);
      if (!externalApiKey) {
        throw new Error('Pix External API Key 未配置，请先在侧边栏填写 Pix 外部 API Key。');
      }
      const cdkeys = parseCdkeyPoolText(runtimeState?.pixRedeemCdkeyPoolText);
      const usage = normalizePixRedeemCdkeyUsage(runtimeState?.pixRedeemCdkeyUsage || {});
      const cdkey = pickFirstUnusedCdkey(cdkeys, usage);
      if (!cdkey) {
        throw new Error('没有可用的 Pix 卡密，请在侧边栏导入未使用卡密。');
      }

      await addStepLog(visibleStep, '正在读取当前 ChatGPT accessToken，用于 Pix 卡密兑换...', 'info');
      const tabId = await resolveSessionTabId(runtimeState);
      const tab = await getResolvedSessionTab(tabId, visibleStep);
      if (chrome?.tabs?.update) {
        await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
      }
      const sessionState = await readCurrentChatGptSession(tab.id, visibleStep);
      throwIfStopped();

      const attemptAt = Math.max(1, Math.floor(Number(now()) || Date.now()));
      await addStepLog(visibleStep, `正在提交 Pix 卡密兑换：${cdkey}`, 'info');
      try {
        await postPixRedeem({
          apiUrl,
          externalApiKey,
          cdkey,
          accessToken: sessionState.accessToken,
        });
        await updateCdkeyUsage(cdkey, () => ({
          usedAt: attemptAt,
          lastAttemptAt: attemptAt,
          lastError: '',
        }));
        await addStepLog(visibleStep, 'Pix 卡密兑换成功，继续 OAuth 后链。', 'success');
        await completeNodeFromBackground(state?.nodeId || 'pix-redeem', { cdkey });
      } catch (error) {
        const message = getErrorMessage(error) || 'Pix 卡密兑换失败。';
        await updateCdkeyUsage(cdkey, (entry) => ({
          ...entry,
          lastAttemptAt: attemptAt,
          lastError: message,
        }));
        throw error;
      }
    }

    return {
      buildPixRedeemApiUrl,
      executePixRedeem,
      isSupportedChatGptSessionUrl,
      normalizePixRedeemCdkeyUsage,
      parseCdkeyPoolText,
    };
  }

  return {
    createPixRedeemExecutor,
  };
});
