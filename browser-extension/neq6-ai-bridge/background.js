const PROVIDERS = {
  chatgpt: "https://chatgpt.com/",
  qwen: "https://chat.qwen.ai/",
  gemini: "https://gemini.google.com/app",
};

const appTabs = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "NEQ6_AI_RUN") {
    const providerUrl = PROVIDERS[message.providerId];
    if (!providerUrl || !sender.tab?.id || typeof message.prompt !== "string") {
      sendResponse({ ok: false });
      return;
    }
    appTabs.set(message.requestId, sender.tab.id);
    chrome.tabs.create({ url: providerUrl, active: true }, (tab) => {
      if (!tab.id) return;
      const onUpdated = (tabId, info) => {
        if (tabId !== tab.id || info.status !== "complete") return;
        chrome.tabs.onUpdated.removeListener(onUpdated);
        const deliver = (attempt = 0) => chrome.tabs.sendMessage(tab.id, {
          type: "NEQ6_AI_PROVIDER_RUN",
          requestId: message.requestId,
          providerId: message.providerId,
          prompt: message.prompt,
        }).catch(() => {
          if (attempt < 20) setTimeout(() => deliver(attempt + 1), 500);
          else returnResult(message.requestId, { ok: false, error: "No se encontró el compositor del chat." });
        });
        deliver();
      };
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
    sendResponse({ ok: true });
    return true;
  }
  if (message?.type === "NEQ6_AI_PROVIDER_RESULT") {
    returnResult(message.requestId, message.result);
    sendResponse({ ok: true });
  }
});

function returnResult(requestId, result) {
  const tabId = appTabs.get(requestId);
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, { type: "NEQ6_AI_RESULT", requestId, result }).catch(() => {});
  appTabs.delete(requestId);
}

