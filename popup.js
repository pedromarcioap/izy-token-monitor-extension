/**
 * Izy Token Monitor - Popup Script
 * Manages configuration including customizable Warning Threshold (10-20%).
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

  // Load saved configuration
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
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
      hudPositionSelect.value = items.hudPosition || DEFAULT_CONFIG.hudPosition;
      autoCollapseCheckbox.checked = items.autoCollapse !== undefined ? Boolean(items.autoCollapse) : DEFAULT_CONFIG.autoCollapse;
      updateModeUI(modeSelect.value);
    });
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

  // Save configuration
  saveBtn.addEventListener('click', () => {
    const selectedMode = modeSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const maxContextTokens = parseInt(contextWindowSelect.value, 10) || 1000000;
    const warningThresholdPercent = parseInt(warningThresholdRange.value, 10) || 15;
    const errorMarginPercent = parseInt(errorMarginSelect.value, 10) || 15;
    const enableEarlyAlert = enableEarlyAlertCheckbox.checked;
    const enablePersistentBlock = persistentBlockToggle.value === 'true';
    const hudPosition = hudPositionSelect.value || 'top-right';
    const autoCollapse = autoCollapseCheckbox.checked;

    if (selectedMode === 'api' && !apiKey) {
      showStatus('Insira a API Key para usar o Modo Exato.', 'warning', 3500);
      apiKeyInput.focus();
      return;
    }

    const payload = {
      mode: selectedMode,
      apiKey: apiKey,
      maxContextTokens: maxContextTokens,
      warningThresholdPercent: warningThresholdPercent,
      alertThresholdPercent: warningThresholdPercent,
      errorMarginPercent: errorMarginPercent,
      enableEarlyAlert: enableEarlyAlert,
      enablePersistentBlock: enablePersistentBlock,
      hudPosition: hudPosition,
      autoCollapse: autoCollapse,
      model: 'gemini-1.5-flash'
    };

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(payload, () => {
        showStatus('Preferências salvas com sucesso!', 'success');
        chrome.tabs.query({ url: '*://gemini.google.com/*' }, (tabs) => {
          if (tabs && tabs.length > 0) {
            tabs.forEach((tab) => {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  action: 'SETTINGS_UPDATED',
                  settings: payload
                }).catch(() => {});
              }
            });
          }
        });
      });
    } else {
      showStatus('Salvo localmente.', 'success');
    }
  });
});