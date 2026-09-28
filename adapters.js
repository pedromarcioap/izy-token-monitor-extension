/**
 * Izy Token Monitor & Optimizer - Adapter Pattern Definitions
 * Isolates DOM structure, context window limits, and input elements per platform.
 */

(function () {
  'use strict';

  // Base Adapter Class
  class BasePlatformAdapter {
    constructor(name, maxContextTokens, charsPerToken) {
      this.name = name;
      this.maxContextTokens = maxContextTokens;
      this.charsPerToken = charsPerToken;
    }

    /**
     * Extracts text content of messages from the DOM, filtering out non-message elements.
     * @returns {{ text: string, count: number }}
     */
    getConversationText() {
      return { text: '', count: 0 };
    }

    /**
     * Finds the active prompt input element (textarea or contenteditable div).
     * @returns {HTMLElement|null}
     */
    getInputElement() {
      return null;
    }

    /**
     * Extracts draft text currently being typed in the active prompt input element.
     * @returns {string}
     */
    getDraftText() {
      const inputEl = this.getInputElement();
      if (!inputEl) return '';

      let text = '';
      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        text = inputEl.value || '';
      } else {
        text = inputEl.innerText || inputEl.textContent || '';
      }

      // Guard against placeholder text in contenteditable divs
      const placeholder = inputEl.getAttribute('placeholder') || inputEl.getAttribute('data-placeholder');
      if (placeholder && text.trim() === placeholder.trim()) {
        return '';
      }

      return text;
    }

    /**
     * Helper to clone elements and strip unwanted elements (buttons, svgs, sidebars).
     */
    cleanAndExtractText(nodes, excludeSelectors) {
      const filtered = Array.from(nodes).filter((node, index, self) => {
        return !self.some((other, otherIdx) => otherIdx !== index && other.contains(node));
      });

      const chunks = [];
      filtered.forEach((node) => {
        const clone = node.cloneNode(true);
        if (excludeSelectors && excludeSelectors.length > 0) {
          excludeSelectors.forEach((sel) => {
            clone.querySelectorAll(sel).forEach((el) => el.remove());
          });
        }
        const text = (clone.innerText || clone.textContent || '').trim();
        if (text) {
          chunks.push(text);
        }
      });

      return {
        text: chunks.join('\n\n'),
        count: filtered.length
      };
    }
  }

  // 1. Google Gemini Adapter
  class GeminiAdapter extends BasePlatformAdapter {
    constructor() {
      super('Google Gemini', 1000000, 3.8);
      this.primarySelectors = [
        'user-query',
        'model-response',
        'ms-user-query',
        'ms-response-container'
      ];
      this.fallbackSelectors = [
        'main user-query',
        'main model-response',
        'main div[class*="query-content"]',
        'main div[class*="response-content"]',
        'main .message-content',
        'main pre',
        'main code',
        'main table',
        'main p',
        'div[class*="query-content"]',
        'div[class*="response-content"]',
        '.message-content'
      ];
      this.excludeSelectors = [
        'button',
        '.action-button',
        '.copy-button',
        '.thumb-container',
        '.feedback-container',
        '.disclaimer',
        '.source-citation',
        '.citation',
        'svg',
        '[role="toolbar"]',
        '[aria-hidden="true"]'
      ];
    }

    getConversationText() {
      const primarySelStr = this.primarySelectors.join(', ');
      let found = document.querySelectorAll(primarySelStr);
      let nodes = found ? Array.from(found) : [];

      if (nodes.length === 0) {
        const fallbackSelStr = this.fallbackSelectors.join(', ');
        const fallbackFound = document.querySelectorAll(fallbackSelStr);
        if (fallbackFound && fallbackFound.length > 0) {
          nodes = Array.from(fallbackFound);
        }
      }

      return this.cleanAndExtractText(nodes, this.excludeSelectors);
    }

    getInputElement() {
      return (
        document.querySelector('rich-textarea div[contenteditable="true"]') ||
        document.querySelector('rich-textarea p') ||
        document.querySelector('div[contenteditable="true"][aria-label*="Gemini"]') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('textarea')
      );
    }
  }

  // 2. OpenAI ChatGPT Adapter
  class ChatGPTAdapter extends BasePlatformAdapter {
    constructor() {
      super('OpenAI ChatGPT', 128000, 3.7);
      this.primarySelectors = [
        '[data-message-author-role="user"]',
        '[data-message-author-role="assistant"]',
        '[data-message-author-role]'
      ];
      this.fallbackSelectors = [
        'article[data-testid^="conversation-turn-"]',
        'div[class*="agent-turn"]',
        'div[class*="user-turn"]',
        '.user-message-bubble-color',
        'div.markdown'
      ];
      this.excludeSelectors = [
        'button',
        'svg',
        '.sr-only',
        '[data-testid="copy-turn-action-button"]',
        '[data-testid="edit-turn-action-button"]',
        '[aria-label*="Copy"]',
        '[aria-label*="Copiar"]',
        '.gizmo-bot-avatar',
        '.gizmo-user-avatar'
      ];
    }

    getConversationText() {
      const primarySelStr = this.primarySelectors.join(', ');
      let found = document.querySelectorAll(primarySelStr);
      let nodes = found ? Array.from(found) : [];

      if (nodes.length === 0) {
        const fallbackSelStr = this.fallbackSelectors.join(', ');
        const fallbackFound = document.querySelectorAll(fallbackSelStr);
        if (fallbackFound && fallbackFound.length > 0) {
          nodes = Array.from(fallbackFound);
        }
      }

      return this.cleanAndExtractText(nodes, this.excludeSelectors);
    }

    getInputElement() {
      return (
        document.querySelector('#prompt-textarea') ||
        document.querySelector('textarea#prompt-textarea') ||
        document.querySelector('div#prompt-textarea[contenteditable="true"]') ||
        document.querySelector('textarea[data-id="root"]') ||
        document.querySelector('textarea')
      );
    }
  }

  // 3. Anthropic Claude Adapter
  class ClaudeAdapter extends BasePlatformAdapter {
    constructor() {
      super('Anthropic Claude', 200000, 3.5);
      this.primarySelectors = [
        '.font-claude-message',
        '[data-is-streaming]',
        'div[class*="font-user-message"]',
        'div[class*="font-claude-response"]',
        '[data-testid="user-message"]',
        '[data-testid="claude-message"]',
        '[data-testid="chat-turn"]'
      ];
      this.fallbackSelectors = [
        'div[class*="message-content"]',
        'main article',
        '.grid-cols-1'
      ];
      this.excludeSelectors = [
        'button',
        'svg',
        '.text-text-500',
        '[aria-label*="Copy"]',
        '[aria-label*="Copiar"]',
        '[aria-label*="Retry"]',
        '[aria-label*="Tentar novamente"]',
        '.opacity-0'
      ];
    }

    getConversationText() {
      const primarySelStr = this.primarySelectors.join(', ');
      let found = document.querySelectorAll(primarySelStr);
      let nodes = found ? Array.from(found) : [];

      if (nodes.length === 0) {
        const fallbackSelStr = this.fallbackSelectors.join(', ');
        const fallbackFound = document.querySelectorAll(fallbackSelStr);
        if (fallbackFound && fallbackFound.length > 0) {
          nodes = Array.from(fallbackFound);
        }
      }

      return this.cleanAndExtractText(nodes, this.excludeSelectors);
    }

    getInputElement() {
      return (
        document.querySelector('fieldset div[contenteditable="true"]') ||
        document.querySelector('div[contenteditable="true"][data-placeholder]') ||
        document.querySelector('div[contenteditable="true"]') ||
        document.querySelector('textarea')
      );
    }
  }

  // Adapter Registry & Manager
  class AdapterManager {
    constructor() {
      this.adapters = {
        'gemini.google.com': new GeminiAdapter(),
        'chatgpt.com': new ChatGPTAdapter(),
        'chat.openai.com': new ChatGPTAdapter(),
        'claude.ai': new ClaudeAdapter()
      };
    }

    /**
     * Resolves the active platform adapter according to window.location.hostname
     * @returns {BasePlatformAdapter|null}
     */
    getAdapter() {
      const hostname = window.location.hostname;
      for (const host in this.adapters) {
        if (hostname === host || hostname.endsWith('.' + host)) {
          return this.adapters[host];
        }
      }
      return null;
    }
  }

  // Expose globally
  window.IzyAdapterManager = new AdapterManager();
})();

