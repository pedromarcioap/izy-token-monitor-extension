/**
 * Izy Token Monitor & Optimizer - Prompt Optimizer Utility Module
 * Provides noise cleanup, code/JSON minification, and context checkpoint generation.
 */

(function () {
  'use strict';

  class PromptOptimizer {
    constructor() {
      // Courtesy phrases to strip (case-insensitive regex patterns)
      this.courtesyPatterns = [
        /^(olá|ola|oi|hey|hello|hi)\b[,\.\s]*/i,
        /^(por favor|por gentileza|pfv|please)\b[,\.\s]*/i,
        /^(você pode|voce pode|pode me ajudar|poderia me ajudar|pode gerar|poderia gerar)\b[,\.\s]*/i,
        /^(estou precisando de ajuda para|preciso que você|preciso que voce)\b[,\.\s]*/i,
        /(muito obrigado|muito obrigada|obrigado|obrigada|agradeço desde já|agradeco desde ja|thanks|thank you)[\.\s!]*$/i,
        /(tenha um bom dia|tenha uma boa tarde|tenha uma boa noite)[\.\s!]*$/i
      ];
    }

    /**
     * Reads current text from the active platform input element.
     * @param {HTMLElement} inputEl
     * @returns {string}
     */
    getInputValue(inputEl) {
      if (!inputEl) return '';
      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        return inputEl.value || '';
      }
      return inputEl.innerText || inputEl.textContent || '';
    }

    /**
     * Updates the text in the active platform input element and triggers DOM events.
     * @param {HTMLElement} inputEl
     * @param {string} text
     */
    setInputValue(inputEl, text) {
      if (!inputEl) return;

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        inputEl.value = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
      } else if (inputEl.isContentEditable || inputEl.getAttribute('contenteditable') === 'true') {
        inputEl.focus();

        // Check for internal paragraph tag (common in Gemini)
        const pChild = inputEl.querySelector('p');
        if (pChild) {
          pChild.innerText = text;
        } else {
          inputEl.innerText = text;
        }

        // Trigger reactive frameworks event listeners (React/Angular/Lit/Vue)
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        inputEl.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, key: ' ' }));
      }
    }

    /**
     * 1. Clean Noise: Removes courtesy expressions, normalizes spaces and excessive line breaks.
     * @param {string} text
     * @returns {string}
     */
    cleanNoise(text) {
      if (!text) return '';

      let cleaned = text;

      // Apply courtesy pattern removals
      this.courtesyPatterns.forEach((pattern) => {
        cleaned = cleaned.replace(pattern, '');
      });

      // Collapse multiple inline spaces to a single space (preserving newlines)
      cleaned = cleaned.replace(/[ \t]+/g, ' ');

      // Trim leading space on lines
      cleaned = cleaned
        .split('\n')
        .map((line) => line.trim())
        .join('\n');

      // Reduce 3+ consecutive line breaks to double line breaks (\n\n)
      cleaned = cleaned.replace(/\n{3,}/g, '\n\n');

      return cleaned.trim();
    }

    /**
     * 2. Minify Code/JSON: Minifies embedded JSON objects/arrays and code blocks.
     * @param {string} text
     * @returns {string}
     */
    minifyCodeOrJson(text) {
      if (!text) return '';

      let result = text;

      // 1. Minify JSON blocks found inside text
      result = result.replace(/(\{[\s\S]*\}|\[[\s\S]*\])/g, (match) => {
        try {
          const parsed = JSON.parse(match);
          return JSON.stringify(parsed);
        } catch {
          // Not valid standalone JSON, return unmodified
          return match;
        }
      });

      // 2. Minify triple backtick code blocks by stripping indentation & extra blanks inside
      result = result.replace(/```([\w-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        const minifiedLines = code
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0)
          .join('\n');

        return `\`\`\`${lang}\n${minifiedLines}\n\`\`\``;
      });

      // 3. Fallback minification for code-like structures outside backticks
      if (result === text && (text.includes('{') || text.includes('['))) {
        result = result
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean)
          .join('\n');
      }

      return result;
    }

    /**
     * 3. Generate Context Checkpoint Prompt
     * @returns {string}
     */
    generateCheckpointPrompt() {
      return `📌 CHECKPOINT DE CONTEXTO & RESUMO EXECUTIVO

Por favor, elabore um resumo executivo abrangente de toda a nossa conversa até o momento para que possamos iniciar uma nova sessão limpa sem perder o contexto. Inclua:

1. 🎯 OBJETIVO PRINCIPAL: Qual é o propósito do projeto/tarefa atual.
2. 💡 DECISÕES ARQUITETURAIS: Principais escolhas técnicas, padrões e diretrizes definidas.
3. 💻 ESTADO DO CÓDIGO/ARQUIVOS: Estado atual dos arquivos implementados e estruturas de dados.
4. 📋 TAREFAS PENDENTES & PRÓXIMOS PASSOS: Ações imediatamente necessárias para continuar o desenvolvimento.

Forneça este resumo em formato Markdown estruturado e pronto para uso como prompt inicial na próxima janela de conversa.`;
    }

    /**
     * Copies text to the system clipboard securely.
     * @param {string} text
     * @returns {Promise<boolean>}
     */
    async copyToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
          return true;
        }
        // Fallback for older DOM contexts
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const success = document.execCommand('copy');
        document.body.removeChild(textarea);
        return success;
      } catch (err) {
        console.error('[Izy Optimizer] Erro ao copiar para área de transferência:', err);
        return false;
      }
    }
  }

  // Expose globally
  window.IzyPromptOptimizer = new PromptOptimizer();
})();
