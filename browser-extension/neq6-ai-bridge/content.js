const APP_HOSTS = new Set(["127.0.0.1:3000", "localhost:3000"]);

if (APP_HOSTS.has(location.host)) {
  window.postMessage({ source: "neq6-ai-bridge", type: "NEQ6_AI_BRIDGE_READY" }, location.origin);
  window.addEventListener("message", (event) => {
    if (event.source !== window || event.origin !== location.origin || event.data?.source !== "neq6-ai-app") return;
    if (event.data.type === "NEQ6_AI_BRIDGE_PING") {
      window.postMessage({ source: "neq6-ai-bridge", type: "NEQ6_AI_BRIDGE_READY" }, location.origin);
      return;
    }
    if (event.data.type !== "NEQ6_AI_RUN") return;
    chrome.runtime.sendMessage({
      type: "NEQ6_AI_RUN",
      requestId: event.data.requestId,
      providerId: event.data.providerId,
      prompt: event.data.prompt,
    });
  });
  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "NEQ6_AI_RESULT") return;
    window.postMessage({ source: "neq6-ai-bridge", ...message }, location.origin);
  });
} else {
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "NEQ6_AI_PROVIDER_RUN") return;
    runProvider(message.providerId, message.prompt)
      .then((response) => chrome.runtime.sendMessage({
        type: "NEQ6_AI_PROVIDER_RESULT",
        requestId: message.requestId,
        result: { ok: true, response },
      }))
      .catch((error) => chrome.runtime.sendMessage({
        type: "NEQ6_AI_PROVIDER_RESULT",
        requestId: message.requestId,
        result: { ok: false, error: String(error?.message ?? error) },
      }));
    sendResponse({ ok: true });
    return true;
  });
}

function roots() {
  const result = [document];
  for (let i = 0; i < result.length; i++) {
    for (const element of result[i].querySelectorAll("*")) if (element.shadowRoot) result.push(element.shadowRoot);
  }
  return result;
}

function deepQuery(selectors) {
  for (const root of roots()) for (const selector of selectors) {
    const found = root.querySelector(selector);
    if (found) return found;
  }
  return null;
}

function deepAll(selectors) {
  const found = [];
  for (const root of roots()) for (const selector of selectors) found.push(...root.querySelectorAll(selector));
  return [...new Set(found)];
}

async function waitFor(find, timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = find();
    if (value) return value;
    await delay(250);
  }
  throw new Error("Tiempo agotado esperando la interfaz del chat.");
}

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function setInput(element, text) {
  element.focus();
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value")?.set;
    setter?.call(element, text);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  } else {
    element.textContent = text;
    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
  }
}

function visible(element) {
  const style = getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.display !== "none" && style.visibility !== "hidden" && rect.width > 0 && rect.height > 0;
}

async function runProvider(providerId, prompt) {
  const config = providerConfig(providerId);
  const input = await waitFor(() => deepQuery(config.inputs));
  setInput(input, prompt);
  const send = await waitFor(() => deepAll(config.sendButtons).find(visible));
  send.click();
  return waitForStableResponse(config);
}

function providerConfig(providerId) {
  if (providerId === "chatgpt") return {
    inputs: ["#prompt-textarea", "#mobile-composer-prompt", "textarea[placeholder*='ChatGPT']", "[contenteditable='true']"],
    sendButtons: ["button[data-testid='send-button']", "button[aria-label='Enviar mensaje']"],
    responses: ["[data-message-author-role='assistant']"],
    stopButtons: ["button[data-testid='stop-button']", "button[aria-label*='Detener']"],
  };
  if (providerId === "qwen") return {
    inputs: ["textarea.message-input-textarea", "textarea[placeholder*='Qwen']"],
    sendButtons: ["button.send-button", "button[aria-label='Enviar']"],
    responses: [".message-content", ".chat-message.assistant", "[data-role='assistant']"],
    stopButtons: ["button[aria-label*='Detener']", ".stop-button"],
  };
  if (providerId === "gemini") return {
    inputs: ["rich-textarea [contenteditable='true']", "div[contenteditable='true']", "textarea"],
    sendButtons: ["button[aria-label='Enviar mensaje']", "button[aria-label*='Enviar']"],
    responses: ["model-response .markdown", "model-response", ".model-response-text", "message-content"],
    stopButtons: ["button[aria-label*='Detener']"],
  };
  throw new Error("Proveedor no compatible con automatización.");
}

async function waitForStableResponse(config) {
  let last = "";
  let stableSince = 0;
  const start = Date.now();
  while (Date.now() - start < 180000) {
    const candidates = deepAll(config.responses).map((element) => element.innerText?.trim()).filter(Boolean);
    const current = candidates.at(-1) ?? "";
    const generating = deepAll(config.stopButtons).some(visible);
    if (current && current === last && !generating) {
      if (!stableSince) stableSince = Date.now();
      if (Date.now() - stableSince >= 2500) return current;
    } else {
      last = current;
      stableSince = 0;
    }
    await delay(500);
  }
  throw new Error("El chat no devolvió una respuesta completa a tiempo.");
}
