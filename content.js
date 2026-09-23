/**
 * Izy Token Monitor - Content Script (Manifest V3)
 * Non-intrusive floating context meter with persistent Warning Threshold notification block.
 */

(function () {
  'use strict';

  if (window.__IZY_TOKEN_MONITOR_INJECTED__) return;
  window.__IZY_TOKEN_MONITOR_INJECTED__ = true;

  // Configuration State
  let config = {
    mode: 'heuristic',
    apiKey: '',
    maxContextTokens: 1000000,
    warningThresholdPercent: 15,
    alertThresholdPercent: 15,
    errorMarginPercent: 15,
    enableEarlyAlert: true,
    enablePersistentBlock: true,
    hudPosition: 'top-right',
    autoCollapse: true,
    model: 'gemini-1.5-flash'
  };

  // Runtime State
  let isExpanded = false;
  let isCalculating = false;
  let lastTextHash = '';
  let debounceTimer = null;
  let currentTokenCount = 0;
  let isApiFallback = false;
  let isBlockDismissed = false;

  // DOM Selectors for Gemini Chat Content
  const MESSAGE_SELECTORS = [
    'user-query',
    'model-response',
    'ms-user-query',
    'ms-response-container',
    '.message-content',
    'div[class*="query-content"]',
    'div[class*="response-content"]',
    'div.markdown'
  ];

  const EXCLUDE_SELECTORS = [
    'button',
    '.action-button',
    '.copy-button',
    '.thumb-container',
    '.feedback-container',
    '.disclaimer',
    '.source-citation',
    '.citation',
    '[role="toolbar"]',
    '[aria-hidden="true"]'
  ];

  async function init() {
    await loadConfig();
    injectMinimalHUD();
    setupDOMObserver();
    setupMessageBridge();

    setTimeout(() => {
      calculateTokens();
    }, 1000);
  }

  function loadConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(
          {
            mode: 'heuristic',
            apiKey: '',
            maxContextTokens: 1000000,
            warningThresholdPercent: 15,
            alertThresholdPercent: 15,
            errorMarginPercent: 15,
            enableEarlyAlert: true,
            enablePersistentBlock: true,
            hudPosition: 'top-right',
            autoCollapse: true,
            model: 'gemini-1.5-flash'
          },
          (items) => {
            config = { ...config, ...items };
            if (items.warningThresholdPercent) {
              config.warningThresholdPercent = items.warningThresholdPercent;
            } else if (items.alertThresholdPercent) {
              config.warningThresholdPercent = items.alertThresholdPercent;
            }
            isExpanded = !config.autoCollapse;
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  }

  function setupMessageBridge() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message && message.action === 'SETTINGS_UPDATED') {
          config = { ...config, ...message.settings };
          if (message.settings.warningThresholdPercent) {
            config.warningThresholdPercent = message.settings.warningThresholdPercent;
          }
          lastTextHash = '';
          updatePositionClass();
          updateMinimalHUD();
          calculateTokens();
        }
      });
    }
  }

  function extractCleanText() {
    const chunks = [];
    for (const sel of MESSAGE_SELECTORS) {
      const elements = document.querySelectorAll(sel);
      if (elements && elements.length > 0) {
        elements.forEach((node) => {
          const clone = node.cloneNode(true);
          EXCLUDE_SELECTORS.forEach((ex) => {
            clone.querySelectorAll(ex).forEach((el) => el.remove());
          });
          const text = (clone.innerText || clone.textContent || '').trim();
          if (text) chunks.push(text);
        });
      }
    }
    return chunks.join('\n\n');
  }

  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}_${str.length}`;
  }

  async function calculateTokens() {
    const fullText = extractCleanText();
    const hash = hashString(fullText);

    if (hash === lastTextHash && currentTokenCount > 0) return;
    lastTextHash = hash;

    if (!fullText) {
      currentTokenCount = 0;
      isApiFallback = false;
      isBlockDismissed = false;
      updateMinimalHUD();
      return;
    }

    isCalculating = true;
    updateMinimalHUD();

    if (config.mode === 'api' && config.apiKey) {
      try {
        const res = await callTokenApi(fullText, config.model);
        if (res && res.success && typeof res.totalTokens === 'number') {
          currentTokenCount = res.totalTokens;
          isApiFallback = false;
        } else {
          isApiFallback = true;
          currentTokenCount = Math.max(1, Math.ceil(fullText.length / 3.5));
        }
      } catch {
        isApiFallback = true;
        currentTokenCount = Math.max(1, Math.ceil(fullText.length / 3.5));
      }
    } else {
      isApiFallback = false;
      currentTokenCount = Math.max(1, Math.ceil(fullText.length / 3.5));
    }

    isCalculating = false;
    updateMinimalHUD();
  }

  function callTokenApi(text, model) {
    return new Promise((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        return resolve({ success: false });
      }
      chrome.runtime.sendMessage(
        { action: 'COUNT_TOKENS', text, model },
        (res) => resolve(res || { success: false })
      );
    });
  }

  function setupDOMObserver() {
    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        calculateTokens();
      }, 900);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  function injectMinimalHUD() {
    if (document.getElementById('izy-hud-root')) return;

    const hudRoot = document.createElement('div');
    hudRoot.id = 'izy-hud-root';
    hudRoot.className = `izy-hud-root ${getPositionClass()}`;

    hudRoot.innerHTML = `
      <div id="izy-hud-pill" class="izy-pill ${isExpanded ? 'izy-expanded' : 'izy-compact'}">
        <!-- Compact Floating Pill -->
        <div id="izy-trigger-pill" class="izy-pill-handle">
          <span class="izy-logo-dot"></span>
          <span id="izy-pill-count" class="izy-pill-tokens">0</span>
          <span id="izy-pill-pct" class="izy-pill-percent">0.0%</span>
          <div class="izy-micro-bar-wrap">
            <div id="izy-pill-bar" class="izy-micro-bar"></div>
          </div>
        </div>

        <!-- PERSISTENT NOTIFICATION BLOCK (Injects when Warning Threshold 10-20% is reached) -->
        <div id="izy-persistent-notification" class="izy-persistent-notification izy-hidden">
          <div class="izy-persist-content">
            <div class="izy-persist-badge">
              <span class="izy-persist-icon">⚠️</span>
              <span id="izy-persist-title" class="izy-persist-title">Warning Threshold Atingido</span>
            </div>
            <p id="izy-persist-desc" class="izy-persist-desc">
              O consumo atingiu <strong>0%</strong> do limite (Teto com margem: <strong>0 tok</strong>).
            </p>
          </div>
          <button id="izy-persist-close-btn" class="izy-persist-close" title="Recolher Notificação">✕</button>
        </div>

        <!-- Flyout Details Menu -->
        <div id="izy-flyout" class="izy-flyout">
          <div class="izy-flyout-top">
            <span class="izy-brand-label">IZY MONITOR</span>
            <button id="izy-refresh-btn" class="izy-btn-action" title="Recalcular Tokens">↻</button>
          </div>

          <div class="izy-flyout-metrics">
            <div class="izy-metric-main">
              <span id="izy-flyout-tokens" class="izy-num-primary">0</span>
              <span class="izy-num-denom">/ <span id="izy-flyout-max">1.000.000</span></span>
            </div>
            <span id="izy-flyout-badge" class="izy-stat-badge">0.0%</span>
          </div>

          <div class="izy-detail-row">
            <span>Threshold Configurado:</span>
            <strong id="izy-cfg-threshold" class="font-mono text-amber-300">15%</strong>
          </div>

          <div class="izy-detail-row">
            <span>Teto (+<span id="izy-margin-val">15</span>% margem):</span>
            <strong id="izy-projected-val" class="font-mono">0 tok</strong>
          </div>

          <div id="izy-alert-bar" class="izy-alert-pill izy-hidden">
            <span>⚠️ Faixa de aviso atingida</span>
          </div>

          <div class="izy-flyout-footer">
            <span id="izy-mode-indicator" class="izy-mode-text">⚡ Heurístico</span>
            <span id="izy-status-indicator" class="izy-status-text">Pronto</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hudRoot);

    const trigger = document.getElementById('izy-trigger-pill');
    const refreshBtn = document.getElementById('izy-refresh-btn');
    const closeBlockBtn = document.getElementById('izy-persist-close-btn');

    if (trigger) {
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        isExpanded = !isExpanded;
        const pill = document.getElementById('izy-hud-pill');
        if (pill) {
          pill.classList.toggle('izy-expanded', isExpanded);
          pill.classList.toggle('izy-compact', !isExpanded);
        }
      });
    }

    if (closeBlockBtn) {
      closeBlockBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        isBlockDismissed = true;
        const block = document.getElementById('izy-persistent-notification');
        if (block) block.classList.add('izy-hidden');
      });
    }

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        lastTextHash = '';
        isBlockDismissed = false;
        calculateTokens();
      });
    }

    // Click outside to collapse flyout
    document.addEventListener('click', (e) => {
      if (isExpanded && !hudRoot.contains(e.target)) {
        isExpanded = false;
        const pill = document.getElementById('izy-hud-pill');
        if (pill) {
          pill.classList.remove('izy-expanded');
          pill.classList.add('izy-compact');
        }
      }
    });

    updateMinimalHUD();
  }

  function getPositionClass() {
    if (config.hudPosition === 'top-center') return 'izy-pos-top-center';
    if (config.hudPosition === 'bottom-right') return 'izy-pos-bottom-right';
    return 'izy-pos-top-right';
  }

  function updatePositionClass() {
    const root = document.getElementById('izy-hud-root');
    if (root) {
      root.className = `izy-hud-root ${getPositionClass()}`;
    }
  }

  function formatNum(n) {
    return new Intl.NumberFormat('pt-BR').format(n);
  }

  function updateMinimalHUD() {
    const pillCount = document.getElementById('izy-pill-count');
    const pillPct = document.getElementById('izy-pill-pct');
    const pillBar = document.getElementById('izy-pill-bar');
    const flyoutTokens = document.getElementById('izy-flyout-tokens');
    const flyoutMax = document.getElementById('izy-flyout-max');
    const flyoutBadge = document.getElementById('izy-flyout-badge');
    const cfgThreshold = document.getElementById('izy-cfg-threshold');
    const projectedVal = document.getElementById('izy-projected-val');
    const marginVal = document.getElementById('izy-margin-val');
    const alertBar = document.getElementById('izy-alert-bar');
    const persistentBlock = document.getElementById('izy-persistent-notification');
    const persistTitle = document.getElementById('izy-persist-title');
    const persistDesc = document.getElementById('izy-persist-desc');
    const modeIndicator = document.getElementById('izy-mode-indicator');
    const statusIndicator = document.getElementById('izy-status-indicator');

    if (!pillCount) return;

    const max = config.maxContextTokens || 1000000;
    const tokens = currentTokenCount || 0;
    const margin = config.errorMarginPercent || 15;
    const warningThreshold = config.warningThresholdPercent || config.alertThresholdPercent || 15;
    const enableEarlyAlert = config.enableEarlyAlert !== false;
    const enablePersistentBlock = config.enablePersistentBlock !== false;

    const projected = Math.ceil(tokens * (1 + margin / 100));
    const pct = Math.min(100, (tokens / max) * 100);
    const projectedPct = Math.min(100, (projected / max) * 100);
    const pctStr = pct < 0.01 && tokens > 0 ? '<0.01%' : `${pct.toFixed(pct >= 10 ? 1 : 2)}%`;

    // Compact pill text
    pillCount.textContent = tokens > 9999 ? `${(tokens / 1000).toFixed(tokens >= 100000 ? 0 : 1)}k` : String(tokens);
    pillPct.textContent = pctStr;
    pillBar.style.width = `${Math.min(100, Math.max(2, pct))}%`;

    // Flyout text
    if (flyoutTokens) flyoutTokens.textContent = formatNum(tokens);
    if (flyoutMax) flyoutMax.textContent = formatNum(max);
    if (flyoutBadge) flyoutBadge.textContent = pctStr;
    if (cfgThreshold) cfgThreshold.textContent = `${warningThreshold}%`;
    if (projectedVal) projectedVal.textContent = `${formatNum(projected)} tok`;
    if (marginVal) marginVal.textContent = String(margin);

    // Warning Threshold evaluation
    const isWarningTriggered = enableEarlyAlert && tokens > 0 && (pct >= warningThreshold || projectedPct >= warningThreshold);
    const pill = document.getElementById('izy-hud-pill');

    if (pill) {
      pill.classList.toggle('izy-alert-state', isWarningTriggered);
    }

    // PERSISTENT NOTIFICATION BLOCK INJECTION & DISPLAY
    if (persistentBlock) {
      if (isWarningTriggered && enablePersistentBlock && !isBlockDismissed) {
        persistentBlock.classList.remove('izy-hidden');
        if (persistTitle) {
          persistTitle.textContent = `Warning Threshold (${warningThreshold}%) Atingido`;
        }
        if (persistDesc) {
          persistDesc.innerHTML = `Consumo atual: <strong>${pctStr}</strong> (${formatNum(tokens)} / ${formatNum(max)} tok). Teto projetado (+ ${margin}%): <strong>${formatNum(projected)} tok</strong>.`;
        }
      } else {
        persistentBlock.classList.add('izy-hidden');
      }
    }

    if (alertBar) {
      alertBar.classList.toggle('izy-hidden', !isWarningTriggered);
      if (isWarningTriggered) {
        alertBar.innerHTML = `<span>⚠️ <strong>${pctStr}</strong> atingido (Limiar: ${warningThreshold}% | Teto: ${formatNum(projected)} tok)</span>`;
      }
    }

    if (modeIndicator) {
      modeIndicator.textContent = config.mode === 'api' && !isApiFallback ? '🎯 API Oficial' : isApiFallback ? '⚠️ Fallback Heurístico' : '⚡ Heurístico';
    }

    if (statusIndicator) {
      statusIndicator.textContent = isCalculating ? 'Contando...' : 'Sincronizado';
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();