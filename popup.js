/**
 * Izy Token Monitor - Popup Script
 * Manages configuration including customizable Warning Threshold (10-20%)
 * and per-Chat ID token persistence options.
 */

document.addEventListener('DOMContentLoaded', () => {
  const modeSelect = document.getElementById('mode-select');
  const modeHelper = document.getElementById('mode-helper');
  const apiKeyInput = document.getElementById('api-key-input');
  const toggleVisibilityBtn = document.getElementById('toggle-visibility-btn');
  const eyeIcon = document.getElementById('eye-icon');
  const eyeOffIcon = document.getElementById('eye-off-icon');
  const contextWindowSelect = document.getElementById('context-window-select');
  const warningThresholdRange = document.getElementById('warning-threshold-range');
  const thresholdValBadge = document.getElementById('threshold-val-badge');
  const errorMarginSelect = document.getElementById('error-margin-select');
  const persistentBlockToggle = document.getElementById('persistent-block-toggle');
  const enableEarlyAlertCheckbox = document.getElementById('enable-early-alert-checkbox');
  const enablePerChatCheckbox = document.getElementById('enable-per-chat-checkbox');
  const activeChatBadge = document.getElementById('active-chat-badge');
  const resetChatBtn = document.getElementById('reset-chat-btn');
  const hudPositionSelect = document.getElementById('hud-position-select');
  const autoCollapseCheckbox = document.getElementById('auto-collapse-checkbox');
  const saveBtn = document.getElementById('save-btn');
  const statusMessage = document.getElementById('status-message');

  const DEFAULT_CONFIG = {
    mode: 'heuristic',
    apiKey: '',
    maxContextTokens: 1000000,
    warningThresholdPercent: 15,
    errorMarginPercent: 15,
    enableEarlyAlert: true,
    enablePersistentBlock: true,
    enablePerChatTracking: true,
    hudPosition: 'top-right',
    autoCollapse: true,
    model: 'gemini-1.5-flash'
  };

  function updateModeUI(mode) {
    if (mode === 'api') {
      modeHelper.textContent = 'Contagem exata via endpoint countTokens do Google AI Studio.';
      if (!apiKeyInput.value.trim()) apiKeyInput.focus();
    } else {
      modeHelper.textContent = 'Processamento local instantâneo sem tráfego externo (~3.5 chars/tok).';
    }
  }

  function updateRangeBadge(val) {
    if (thresholdValBadge) {
      thresholdValBadge.textContent = `${val}%`;
    }
    if (warningThresholdRange) {
      warningThresholdRange.setAttribute('aria-valuenow', String(val));
      warningThresholdRange.setAttribute('aria-valuetext', `${val}%`);
    }
  }

  function showStatus(text, type = 'success', duration = 2500) {
    statusMessage.textContent = text;
    statusMessage.className = `izy-status ${type}`;
    setTimeout(() => {
      if (statusMessage.textContent === text) {
        statusMessage.textContent = '';
        statusMessage.className = 'izy-status';
      }
    }, duration);
  }

  function renderActiveChatInfo(res) {
    if (!activeChatBadge) return;
    if (res?.chatId) {
      const displayId = res.chatId.length > 12 ? `${res.chatId.substring(0, 10)}...` : res.chatId;
      activeChatBadge.textContent = `${displayId} (${res.tokens || 0} tok)`;
    } else {
      activeChatBadge.textContent = 'Aba Gemini não ativa';
    }
  }

  function handleActiveTabForChatInfo(tabs) {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'GET_CHAT_INFO' }, renderActiveChatInfo);
    }
  }

  function queryActiveChatInfo() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, handleActiveTabForChatInfo);
    }
  }

  // Load saved configuration
  if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
    chrome.storage.sync.get(DEFAULT_CONFIG, (items) => {
      modeSelect.value = items.mode || DEFAULT_CONFIG.mode;
      apiKeyInput.value = items.apiKey || '';
      contextWindowSelect.value = String(items.maxContextTokens || DEFAULT_CONFIG.maxContextTokens);

      const threshold = items.warningThresholdPercent || items.alertThresholdPercent || DEFAULT_CONFIG.warningThresholdPercent;
      warningThresholdRange.value = String(threshold);
      updateRangeBadge(threshold);

      errorMarginSelect.value = String(items.errorMarginPercent || DEFAULT_CONFIG.errorMarginPercent);
      persistentBlockToggle.value = items.enablePersistentBlock !== false ? 'true' : 'false';
      enableEarlyAlertCheckbox.checked = items.enableEarlyAlert !== undefined ? Boolean(items.enableEarlyAlert) : DEFAULT_CONFIG.enableEarlyAlert;

      if (enablePerChatCheckbox) {
        enablePerChatCheckbox.checked = items.enablePerChatTracking !== undefined ? Boolean(items.enablePerChatTracking) : DEFAULT_CONFIG.enablePerChatTracking;
      }

      hudPositionSelect.value = items.hudPosition || DEFAULT_CONFIG.hudPosition;
      autoCollapseCheckbox.checked = items.autoCollapse !== undefined ? Boolean(items.autoCollapse) : DEFAULT_CONFIG.autoCollapse;
      updateModeUI(modeSelect.value);

      queryActiveChatInfo();
    });
  }

  function handleResetChatResponse(res) {
    if (res?.success) {
      showStatus('Tokens do chat resetados.', 'success');
      queryActiveChatInfo();
    }
  }

  function handleActiveTabForReset(tabs) {
    if (tabs && tabs.length > 0 && tabs[0].id) {
      chrome.tabs.sendMessage(tabs[0].id, { action: 'RESET_CHAT_TOKENS' }, handleResetChatResponse);
    }
  }

  function resetActiveChatTokens() {
    if (typeof chrome !== 'undefined' && chrome.tabs?.query) {
      chrome.tabs.query({ active: true, currentWindow: true }, handleActiveTabForReset);
    }
  }

  if (resetChatBtn) {
    resetChatBtn.addEventListener('click', resetActiveChatTokens);
  }

  warningThresholdRange.addEventListener('input', (e) => {
    updateRangeBadge(e.target.value);
  });

  toggleVisibilityBtn.addEventListener('click', () => {
    const isPassword = apiKeyInput.type === 'password';
    apiKeyInput.type = isPassword ? 'text' : 'password';
    eyeIcon.classList.toggle('hidden', isPassword);
    eyeOffIcon.classList.toggle('hidden', !isPassword);
  });

  modeSelect.addEventListener('change', () => {
    updateModeUI(modeSelect.value);
  });

  function notifyTabOfSettings(tab, payload) {
    if (!tab.id) return;
    chrome.tabs.sendMessage(tab.id, {
      action: 'SETTINGS_UPDATED',
      settings: payload
    }).catch(() => { });
  }

  function notifyGeminiTabs(tabs, payload) {
    if (tabs && tabs.length > 0) {
      tabs.forEach((tab) => notifyTabOfSettings(tab, payload));
    }
  }

  function broadcastSettingsToGeminiTabs(payload) {
    chrome.tabs.query({ url: '*://gemini.google.com/*' }, (tabs) => {
      notifyGeminiTabs(tabs, payload);
    });
  }

  function buildSettingsPayload() {
    const warningThresholdPercent = Number.parseInt(warningThresholdRange.value, 10) || 15;
    return {
      mode: modeSelect.value,
      apiKey: apiKeyInput.value.trim(),
      maxContextTokens: Number.parseInt(contextWindowSelect.value, 10) || 1000000,
      warningThresholdPercent: warningThresholdPercent,
      alertThresholdPercent: warningThresholdPercent,
      errorMarginPercent: Number.parseInt(errorMarginSelect.value, 10) || 15,
      enableEarlyAlert: enableEarlyAlertCheckbox.checked,
      enablePersistentBlock: persistentBlockToggle.value === 'true',
      enablePerChatTracking: enablePerChatCheckbox ? enablePerChatCheckbox.checked : true,
      hudPosition: hudPositionSelect.value || 'top-right',
      autoCollapse: autoCollapseCheckbox.checked,
      model: 'gemini-1.5-flash'
    };
  }

  // Save configuration
  saveBtn.addEventListener('click', () => {
    const payload = buildSettingsPayload();

    if (payload.mode === 'api' && !payload.apiKey) {
      showStatus('Insira a API Key para usar o Modo Exato.', 'warning', 3500);
      apiKeyInput.focus();
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.sync) {
      chrome.storage.sync.set(payload, () => {
        showStatus('Preferências salvas com sucesso!', 'success');
        broadcastSettingsToGeminiTabs(payload);
      });
    } else {
      showStatus('Salvo localmente.', 'success');
    }
  });
});