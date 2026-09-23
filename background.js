/**
 * Izy Token Monitor - Background Service Worker (Manifest V3)
 * Proxies Google AI Studio API requests safely with CORS isolation.
 */

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.action === 'COUNT_TOKENS') {
    handleCountTokens(message.text, message.model)
      .then((res) => sendResponse(res))
      .catch((err) => {
        sendResponse({
          success: false,
          error: err.message || 'Erro no service worker.',
          fallbackToHeuristic: true
        });
      });
    return true;
  }
});

async function handleCountTokens(text, overrideModel) {
  if (!text || typeof text !== 'string') {
    return { success: true, totalTokens: 0 };
  }

  const config = await new Promise((resolve) => {
    chrome.storage.sync.get(
      { apiKey: '', model: 'gemini-1.5-flash' },
      resolve
    );
  });

  const apiKey = (config.apiKey || '').trim();
  const model = overrideModel || config.model || 'gemini-1.5-flash';

  if (!apiKey) {
    return { success: false, fallbackToHeuristic: true, error: 'Chave de API não definida.' };
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:countTokens?key=${encodeURIComponent(apiKey)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text }] }] })
    });

    if (!res.ok) {
      return { success: false, status: res.status, fallbackToHeuristic: true };
    }

    const data = await res.json();
    if (typeof data.totalTokens === 'number') {
      return { success: true, totalTokens: data.totalTokens };
    }
    return { success: false, fallbackToHeuristic: true };
  } catch (err) {
    return { success: false, error: err.message, fallbackToHeuristic: true };
  }
}