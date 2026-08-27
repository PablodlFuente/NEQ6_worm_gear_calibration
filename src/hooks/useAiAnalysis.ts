import { useEffect, useState } from "react";

export interface AiProvider {
  id: string;
  name: string;
  url: string;
  adapter?: {
    input: string;
    send: string;
    response: string;
    stop?: string;
  };
}

export interface AiAnalysisSettings {
  enabled: boolean;
  providers: AiProvider[];
}

export interface SavedAiResponse {
  text: string;
  updatedAt: number;
}

const SETTINGS_KEY = "neq6-ai-analysis-settings-v1";
const RESPONSES_KEY = "neq6-ai-analysis-responses-v1";
const EVENT = "neq6-ai-analysis-settings";

export const DEFAULT_AI_PROVIDERS: AiProvider[] = [
  {
    id: "chatgpt", name: "ChatGPT", url: "https://chatgpt.com/",
    adapter: {
      input: "div#prompt-textarea, #mobile-composer-prompt, div[contenteditable='true'][role='textbox'], textarea[placeholder*='ChatGPT']",
      send: "button[data-testid='send-button'], button[aria-label='Send prompt'], button[aria-label='Enviar prompt'], button[aria-label='Enviar mensaje'], button[aria-label='Send message']",
      response: "div[data-message-author-role='assistant'], div.markdown.prose",
      stop: "button[data-testid='stop-button'], button[aria-label*='Detener'], button[aria-label*='Stop']",
    },
  },
  {
    id: "qwen", name: "Qwen", url: "https://chat.qwen.ai/",
    adapter: {
      input: "textarea.message-input-textarea, textarea[placeholder*='Qwen']",
      send: "button.send-button, .chat-prompt-send-button button, div.message-input-right-button-send button, button[aria-label='Enviar'], button[aria-label='Send']",
      response: "div.response-message-content.phase-answer, div.response-message-content, div.chat-response-message, div[id^='chat-response-message-']",
      stop: "button.stop-button, button[aria-label*='Detener'], button[aria-label*='Stop']",
    },
  },
  {
    id: "gemini", name: "Gemini", url: "https://gemini.google.com/app",
    adapter: {
      input: "rich-textarea [contenteditable='true'], div[contenteditable='true']",
      send: "button[aria-label='Enviar mensaje'], button[aria-label*='Enviar'], button[aria-label*='Send']",
      response: "model-response .markdown, model-response, .model-response-text, message-content",
      stop: "button[aria-label*='Detener'], button[aria-label*='Stop']",
    },
  },
];

const defaults = (): AiAnalysisSettings => ({ enabled: false, providers: DEFAULT_AI_PROVIDERS.map((provider) => ({ ...provider })) });

export function loadAiSettings(): AiAnalysisSettings {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<AiAnalysisSettings> | null;
    if (!parsed) return defaults();
    const providers = Array.isArray(parsed.providers)
      ? parsed.providers.filter((provider): provider is AiProvider => Boolean(provider?.id && provider?.name && provider?.url))
      : DEFAULT_AI_PROVIDERS;
    providers.forEach((provider) => {
      const builtIn = DEFAULT_AI_PROVIDERS.find((item) => item.id === provider.id);
      if (!provider.adapter && builtIn?.adapter) provider.adapter = { ...builtIn.adapter };
    });
    providers.sort((a, b) => Number(b.id === "chatgpt") - Number(a.id === "chatgpt"));
    return { enabled: Boolean(parsed.enabled), providers };
  } catch {
    return defaults();
  }
}

export function saveAiSettings(settings: AiAnalysisSettings) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: settings }));
}

export function useAiSettings() {
  const [settings, setSettingsState] = useState<AiAnalysisSettings>(loadAiSettings);
  useEffect(() => {
    const sync = (event: Event) => setSettingsState((event as CustomEvent<AiAnalysisSettings>).detail ?? loadAiSettings());
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  const setSettings = (next: AiAnalysisSettings) => {
    saveAiSettings(next);
    setSettingsState(next);
  };
  return [settings, setSettings] as const;
}

export function analysisFingerprint(prompt: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function loadResponses(): Record<string, SavedAiResponse> {
  try {
    return JSON.parse(localStorage.getItem(RESPONSES_KEY) ?? "{}") as Record<string, SavedAiResponse>;
  } catch {
    return {};
  }
}

export function getAiResponse(providerId: string, fingerprint: string): SavedAiResponse | null {
  return loadResponses()[`${providerId}:${fingerprint}`] ?? null;
}

export function saveAiResponse(providerId: string, fingerprint: string, text: string): SavedAiResponse {
  const all = loadResponses();
  const saved = { text, updatedAt: Date.now() };
  all[`${providerId}:${fingerprint}`] = saved;
  localStorage.setItem(RESPONSES_KEY, JSON.stringify(all));
  return saved;
}
