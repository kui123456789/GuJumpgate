(function attachBackgroundSkipPasskeyEnrollment(root, factory) {
  root.MultiPageBackgroundSkipPasskeyEnrollment = factory();
})(typeof self !== 'undefined' ? self : globalThis, function createBackgroundSkipPasskeyEnrollmentModule() {
  function createSkipPasskeyEnrollmentExecutor(deps = {}) {
    const {
      addLog,
      chrome,
      completeNodeFromBackground,
      getTabId,
      sendToContentScript,
      throwIfStopped = () => {},
      waitForTabStableComplete = null,
    } = deps;

    async function executeSkipPasskeyEnrollment() {
      const signupTabId = await getTabId('signup-page');
      if (!signupTabId) {
        throw new Error('认证页面标签页已关闭，无法继续步骤 4.5。请先执行步骤 1 或步骤 2，重新打开认证页后再试。');
      }

      await chrome.tabs.update(signupTabId, { active: true });
      throwIfStopped();

      if (typeof waitForTabStableComplete === 'function') {
        await addLog('步骤 4.5：等待认证页完成加载后检测通行密钥创建页...', 'info');
        await waitForTabStableComplete(signupTabId, {
          timeoutMs: 30000,
          retryDelayMs: 300,
          stableMs: 600,
          initialDelayMs: 250,
        });
      }

      throwIfStopped();
      const result = await sendToContentScript('signup-page', {
        type: 'EXECUTE_NODE',
        nodeId: 'skip-passkey-enrollment',
        step: 45,
        source: 'background',
        payload: {
          nodeId: 'skip-passkey-enrollment',
          visibleStep: 45,
        },
      });

      await completeNodeFromBackground('skip-passkey-enrollment', {
        ...(result || {}),
      });

      return result || {};
    }

    return { executeSkipPasskeyEnrollment };
  }

  return { createSkipPasskeyEnrollmentExecutor };
});
