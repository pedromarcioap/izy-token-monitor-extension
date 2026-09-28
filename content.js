/**
 * Izy Token Monitor & Optimizer - Main Content Script (Manifest V3)
 * Orchestrates multi-platform adapters (Gemini, ChatGPT, Claude), cumulative context tracking
 * (User Inputs + Assistant Outputs + Active Draft Input), real-time input event triggers,
 * 700ms debounced MutationObserver for streaming, dynamic progress bar styling, and optimizer tools.
 */

(function () {
  'use strict';

  if (window.__IZY_TOKEN_MONITOR_INJECTED__) return;

  // 1. Resolve Platform Adapter
  const adapter = window.IzyAdapterManager ? window.IzyAdapterManager.getAdapter() : null;

  // Abort silently if current platform is unsupported
  if (!adapter) {
    return;
  }

  window.__IZY_TOKEN_MONITOR_INJECTED__ = true;

  // Runtime State
  let isExpanded = false;
  let isCalculating = false;
  let lastTextHash = '';
  let debounceTimer = null;
  let inputDebounceTimer = null;
  let currentTokenCount = 0;
  let currentChatId = 'chat_default';

  // Config State
  let config = {
    warningThresholdPercent: 70,
    alertThresholdPercent: 90,
    hudPosition: 'top-right',
    autoCollapse: true
  };

  /**
   * Main Initialization Procedure
   */
  async function init() {
    await loadConfig();
    currentChatId = getChatId();

    injectHUD();
    setupDOMObserver();
    setupInputObserver();
    setupMessageBridge();
    setupURLObserver();

    // Initial calculation delay after DOM load
    setTimeout(() => {
      recalculateTokens();
    }, 800);
  }

  /**
   * Generates a fast hash of the full text to avoid unnecessary recalculations
   */
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash |= 0;
    }
    return `${hash}_${str.length}`;
  }

  /**
   * Extracts current Chat ID from URL pathname
   */
  function getChatId() {
    try {
      const pathname = window.location.pathname;
      const parts = pathname.split('/').filter(Boolean);
      if (parts.length > 0) {
        const last = parts[parts.length - 1];
        if (last && last.length >= 4) return last;
      }
    } catch (err) {
      console.error('[Izy Monitor] Erro ao obter Chat ID:', err);
    }
    return 'chat_default';
  }

  /**
   * Load stored settings from chrome.storage if available
   */
  function loadConfig() {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(
          {
            hudPosition: 'top-right',
            autoCollapse: true
          },
          (items) => {
            config = { ...config, ...items };
            isExpanded = !config.autoCollapse;
            resolve();
          }
        );
      } else {
        resolve();
      }
    });
  }

  /**
   * Setup extension runtime message bridge
   */
  function setupMessageBridge() {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message && message.action === 'SETTINGS_UPDATED') {
          config = { ...config, ...message.settings };
          updatePositionClass();
          updateHUD();
        } else if (message && message.action === 'GET_CHAT_INFO') {
          sendResponse({
            platform: adapter.name,
            chatId: currentChatId,
            tokens: currentTokenCount,
            maxTokens: adapter.maxContextTokens
          });
        }
      });
    }
  }

  /**
   * URL Navigation Observer for Single Page Application (SPA) state changes
   */
  function setupURLObserver() {
    function checkUrlChange() {
      const newChatId = getChatId();
      if (newChatId !== currentChatId) {
        currentChatId = newChatId;
        lastTextHash = '';
        recalculateTokens();
      }
    }

    const originalPush = history.pushState;
    if (originalPush) {
      history.pushState = function () {
        originalPush.apply(this, arguments);
        checkUrlChange();
      };
    }

    const originalReplace = history.replaceState;
    if (originalReplace) {
      history.replaceState = function () {
        originalReplace.apply(this, arguments);
        checkUrlChange();
      };
    }

    window.addEventListener('popstate', checkUrlChange);
    setInterval(checkUrlChange, 1200);
  }

  /**
   * Active Input Event Observer for real-time token recalculation while typing
   */
  function setupInputObserver() {
    const handleInput = () => {
      if (inputDebounceTimer) clearTimeout(inputDebounceTimer);
      inputDebounceTimer = setTimeout(() => {
        recalculateTokens();
      }, 150);
    };

    document.addEventListener('input', handleInput, true);
    document.addEventListener('keyup', handleInput, true);
    document.addEventListener('compositionend', handleInput, true);
  }

  /**
   * DOM MutationObserver with 700ms debounce to accommodate response streaming
   */
  function setupDOMObserver() {
    const targetNode = document.body;

    const observer = new MutationObserver(() => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        recalculateTokens();
      }, 700); // 700ms debounce requirement (600ms - 800ms)
    });

    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      characterData: true
    });
  }

  /**
   * Computes tokens using cumulative sum:
   * 1. All previous user questions + assistant responses (Conversation History)
   * 2. Active draft text in prompt input box
   */
  function recalculateTokens() {
    try {
      // 1. Extract conversation text from rendered DOM history (User + Assistant)
      const conversationRes = adapter.getConversationText();
      const conversationText = conversationRes && conversationRes.text ? conversationRes.text.trim() : '';

      // 2. Extract active draft input text from input element
      let draftText = '';
      if (typeof adapter.getDraftText === 'function') {
        draftText = adapter.getDraftText() || '';
      } else {
        const inputEl = adapter.getInputElement();
        if (inputEl) {
          if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
            draftText = inputEl.value || '';
          } else {
            draftText = inputEl.innerText || inputEl.textContent || '';
          }
        }
      }
      draftText = draftText.trim();

      // 3. Cumulative sum: conversationText + " " + draftText
      let totalText = '';
      if (conversationText && draftText) {
        totalText = conversationText + ' ' + draftText;
      } else if (conversationText) {
        totalText = conversationText;
      } else if (draftText) {
        totalText = draftText;
      }

      // 4. Hash verification for caching
      const hash = hashString(totalText);
      if (hash === lastTextHash && currentTokenCount >= 0) return;
      lastTextHash = hash;

      if (!totalText) {
        currentTokenCount = 0;
        updateHUD();
        return;
      }

      isCalculating = true;
      updateHUD();

      // 5. Heuristic token estimation using adapter's charsPerToken multiplier
      const estimatedTokens = Math.max(0, Math.ceil(totalText.length / adapter.charsPerToken));

      currentTokenCount = estimatedTokens;
      isCalculating = false;
      updateHUD();
    } catch (err) {
      console.error('[Izy Monitor] Erro ao recalcular tokens:', err);
      isCalculating = false;
      updateHUD();
    }
  }

  // Alias for compatibility
  function calculateTokens() {
    return recalculateTokens();
  }

  /**
   * Injects the Unified Floating HUD DOM Structure into document body
   */
  function injectHUD() {
    if (document.getElementById('izy-hud-root')) return;

    const hudRoot = document.createElement('div');
    hudRoot.id = 'izy-hud-root';
    hudRoot.className = `izy-hud-root ${getPositionClass()}`;

    // Platform key for badge styling (gemini, chatgpt, claude)
    const platformKey = adapter.name.toLowerCase().includes('gemini')
      ? 'gemini'
      : adapter.name.toLowerCase().includes('chatgpt')
      ? 'chatgpt'
      : 'claude';

    hudRoot.innerHTML = `
      <div id="izy-hud-pill" class="izy-pill ${isExpanded ? 'izy-expanded' : 'izy-compact'} izy-platform-${platformKey}">
        <!-- Compact Pill Bar Handle -->
        <div id="izy-trigger-pill" class="izy-pill-handle" title="Clique para expandir/minimizar">
          <span class="izy-platform-badge izy-badge-${platformKey}">${adapter.name.replace('Google ', '').replace('OpenAI ', '').replace('Anthropic ', '')}</span>
          <span id="izy-pill-count" class="izy-pill-tokens">0 tok</span>
          <span id="izy-pill-pct" class="izy-pill-percent">0.0%</span>
          <div class="izy-micro-bar-wrap">
            <div id="izy-pill-bar" class="izy-micro-bar bar-blue"></div>
          </div>
          <button id="izy-toggle-btn" class="izy-btn-toggle" title="Minimizar / Expandir">▼</button>
        </div>

        <!-- Expanded Flyout & Optimizer Panel -->
        <div id="izy-flyout" class="izy-flyout">
          <div class="izy-flyout-header">
            <div class="izy-header-brand">
              <span class="izy-brand-title">IZY TOKEN MONITOR</span>
              <span class="izy-platform-tag tag-${platformKey}">${adapter.name}</span>
            </div>
            <button id="izy-refresh-btn" class="izy-btn-action" title="Recalcular Tokens Agora">↻</button>
          </div>

          <div class="izy-flyout-metrics">
            <div class="izy-metric-main">
              <span id="izy-flyout-tokens" class="izy-num-primary">0</span>
              <span class="izy-num-denom">/ <span id="izy-flyout-max">${formatNum(adapter.maxContextTokens)}</span></span>
            </div>
            <span id="izy-flyout-badge" class="izy-stat-badge badge-blue">0.0%</span>
          </div>

          <!-- Dynamic Progress Bar -->
          <div class="izy-progress-container">
            <div id="izy-progress-bar-fill" class="izy-progress-bar-fill bar-blue" style="width: 0%;"></div>
          </div>

          <div class="izy-detail-row">
            <span>Janela de Contexto:</span>
            <strong class="font-mono">${formatNum(adapter.maxContextTokens)} tokens</strong>
          </div>

          <div class="izy-detail-row">
            <span>Conversão Estimada:</span>
            <strong class="font-mono">${adapter.charsPerToken} chars/tok</strong>
          </div>

          <!-- OPTIMIZER TOOLBAR SECTION -->
          <div class="izy-optimizer-section">
            <div class="izy-section-title">⚡ Otimizador de Input</div>
            <div class="izy-optimizer-buttons">
              <button id="izy-opt-clean-btn" class="izy-opt-btn" title="Remove saudações, frases vazias e espaços extras">
                🧹 Limpar Ruído
              </button>
              <button id="izy-opt-minify-btn" class="izy-opt-btn" title="Minifica estruturas JSON e blocos de código">
                📦 Minificar Código
              </button>
              <button id="izy-opt-checkpoint-btn" class="izy-opt-btn izy-opt-accent" title="Copia prompt para gerar resumo executivo e abrir novo chat">
                📌 Checkpoint
              </button>
            </div>
            <div id="izy-opt-toast" class="izy-opt-toast izy-hidden"></div>
          </div>

          <div class="izy-flyout-footer">
            <span id="izy-status-indicator" class="izy-status-text">Sincronizado</span>
            <span class="izy-version-text">v2.0.0</span>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(hudRoot);

    // Event Listeners setup
    const trigger = document.getElementById('izy-trigger-pill');
    const toggleBtn = document.getElementById('izy-toggle-btn');
    const refreshBtn = document.getElementById('izy-refresh-btn');
    const cleanBtn = document.getElementById('izy-opt-clean-btn');
    const minifyBtn = document.getElementById('izy-opt-minify-btn');
    const checkpointBtn = document.getElementById('izy-opt-checkpoint-btn');

    function toggleExpand(e) {
      if (e) e.stopPropagation();
      isExpanded = !isExpanded;
      const pill = document.getElementById('izy-hud-pill');
      if (pill) {
        pill.classList.toggle('izy-expanded', isExpanded);
        pill.classList.toggle('izy-compact', !isExpanded);
      }
      if (toggleBtn) {
        toggleBtn.textContent = isExpanded ? '▲' : '▼';
      }
    }

    if (trigger) trigger.addEventListener('click', toggleExpand);
    if (toggleBtn) toggleBtn.addEventListener('click', toggleExpand);

    if (refreshBtn) {
      refreshBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        lastTextHash = '';
        recalculateTokens();
        showToast('Tokens recalculados!');
      });
    }

    // Optimizer Button Actions
    if (cleanBtn) {
      cleanBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const inputEl = adapter.getInputElement();
        if (!inputEl) {
          showToast('Caixa de texto não encontrada!');
          return;
        }
        const currentVal = window.IzyPromptOptimizer.getInputValue(inputEl);
        if (!currentVal.trim()) {
          showToast('Caixa de texto vazia.');
          return;
        }
        const cleaned = window.IzyPromptOptimizer.cleanNoise(currentVal);
        window.IzyPromptOptimizer.setInputValue(inputEl, cleaned);
        const charsSaved = currentVal.length - cleaned.length;
        lastTextHash = '';
        recalculateTokens();
        showToast(charsSaved > 0 ? `Ruído removido! (-${charsSaved} chars)` : 'Texto já otimizado!');
      });
    }

    if (minifyBtn) {
      minifyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const inputEl = adapter.getInputElement();
        if (!inputEl) {
          showToast('Caixa de texto não encontrada!');
          return;
        }
        const currentVal = window.IzyPromptOptimizer.getInputValue(inputEl);
        if (!currentVal.trim()) {
          showToast('Caixa de texto vazia.');
          return;
        }
        const minified = window.IzyPromptOptimizer.minifyCodeOrJson(currentVal);
        window.IzyPromptOptimizer.setInputValue(inputEl, minified);
        const charsSaved = currentVal.length - minified.length;
        lastTextHash = '';
        recalculateTokens();
        showToast(charsSaved > 0 ? `Código/JSON minificado! (-${charsSaved} chars)` : 'Nenhum bloco minificável encontrado.');
      });
    }

    if (checkpointBtn) {
      checkpointBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const checkpointPrompt = window.IzyPromptOptimizer.generateCheckpointPrompt();
        const success = await window.IzyPromptOptimizer.copyToClipboard(checkpointPrompt);
        if (success) {
          showToast('📌 Checkpoint copiado para a área de transferência!');
        } else {
          showToast('Erro ao copiar checkpoint.');
        }
      });
    }

    // Close flyout when clicking outside
    document.addEventListener('click', (e) => {
      if (isExpanded && !hudRoot.contains(e.target)) {
        isExpanded = false;
        const pill = document.getElementById('izy-hud-pill');
        if (pill) {
          pill.classList.remove('izy-expanded');
          pill.classList.add('izy-compact');
        }
        if (toggleBtn) toggleBtn.textContent = '▼';
      }
    });

    updateHUD();
  }

  /**
   * Display temporary toast notification inside HUD
   */
  function showToast(msg) {
    const toast = document.getElementById('izy-opt-toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('izy-hidden');
    setTimeout(() => {
      toast.classList.add('izy-hidden');
    }, 2800);
  }

  function getPositionClass() {
    if (config.hudPosition === 'top-center') return 'izy-pos-top-center';
    if (config.hudPosition === 'bottom-right') return 'izy-pos-bottom-right';
    return 'izy-pos-top-right';
  }

  function updatePositionClass() {
    const root = document.getElementById('izy-hud-root');
    if (root) root.className = `izy-hud-root ${getPositionClass()}`;
  }

  function formatNum(n) {
    return new Intl.NumberFormat('pt-BR').format(n);
  }

  /**
   * Updates HUD Metrics, Progress Bar color and status
   */
  function updateHUD() {
    const pillCount = document.getElementById('izy-pill-count');
    const pillPct = document.getElementById('izy-pill-pct');
    const pillBar = document.getElementById('izy-pill-bar');
    const flyoutTokens = document.getElementById('izy-flyout-tokens');
    const flyoutBadge = document.getElementById('izy-flyout-badge');
    const progressBarFill = document.getElementById('izy-progress-bar-fill');
    const statusIndicator = document.getElementById('izy-status-indicator');

    if (!pillCount) return;

    const max = adapter.maxContextTokens;
    const tokens = currentTokenCount || 0;
    const pct = Math.min(100, (tokens / max) * 100);
    const pctStr = `${pct.toFixed(pct >= 10 ? 1 : 2)}%`;

    // Compact Pill updates
    pillCount.textContent = tokens > 9999 ? `${(tokens / 1000).toFixed(tokens >= 100000 ? 0 : 1)}k tok` : `${tokens} tok`;
    pillPct.textContent = pctStr;
    pillBar.style.width = `${Math.min(100, Math.max(2, pct))}%`;

    // Flyout updates
    if (flyoutTokens) flyoutTokens.textContent = formatNum(tokens);
    if (flyoutBadge) flyoutBadge.textContent = pctStr;
    if (progressBarFill) progressBarFill.style.width = `${Math.min(100, pct)}%`;

    // Dynamic Color Rules:
    // Blue < 70% | Yellow/Amber 70-90% | Red > 90%
    let colorClass = 'bar-blue';
    let badgeClass = 'badge-blue';

    if (pct >= 90) {
      colorClass = 'bar-red';
      badgeClass = 'badge-red';
    } else if (pct >= 70) {
      colorClass = 'bar-amber';
      badgeClass = 'badge-amber';
    }

    // Apply color classes
    if (pillBar) {
      pillBar.className = `izy-micro-bar ${colorClass}`;
    }
    if (progressBarFill) {
      progressBarFill.className = `izy-progress-bar-fill ${colorClass}`;
    }
    if (flyoutBadge) {
      flyoutBadge.className = `izy-stat-badge ${badgeClass}`;
    }

    if (statusIndicator) {
      statusIndicator.textContent = isCalculating ? 'Contando...' : 'Sincronizado';
    }
  }

  // Initialize on document readystate
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();