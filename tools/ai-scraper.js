import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const BUILT_INS = {
  chatgpt: {
    url: "https://chatgpt.com/",
    input: "div#prompt-textarea, #mobile-composer-prompt, div[contenteditable='true'][role='textbox'], textarea[placeholder*='ChatGPT']",
    send: "button[data-testid='send-button'], button[aria-label='Send prompt'], button[aria-label='Enviar prompt'], button[aria-label='Enviar mensaje'], button[aria-label='Send message']",
    response: "div[data-message-author-role='assistant'], div.markdown.prose",
    turns: "article[data-testid^='conversation-turn']",
    bodyAfterPrompt: true,
    stop: "button[data-testid='stop-button'], button[aria-label*='Detener'], button[aria-label*='Stop']",
    blocked: "div[data-testid='rate-limit-message'], div.captcha-container, iframe[src*='captcha']",
  },
  qwen: {
    url: "https://chat.qwen.ai/",
    input: "textarea.message-input-textarea, textarea[placeholder*='Qwen']",
    send: "button.send-button, .chat-prompt-send-button button, div.message-input-right-button-send button, button[aria-label='Enviar'], button[aria-label='Send']",
    response: "div.response-message-content.phase-answer, div.response-message-content, div.chat-response-message, div[id^='chat-response-message-']",
    stop: "button.stop-button, button[aria-label*='Detener'], button[aria-label*='Stop']",
  },
  gemini: {
    url: "https://gemini.google.com/app",
    input: "rich-textarea [contenteditable='true'], div[contenteditable='true']",
    send: "button[aria-label='Enviar mensaje'], button[aria-label*='Enviar'], button[aria-label*='Send']",
    response: "model-response .markdown, model-response, .model-response-text, message-content",
    stop: "button[aria-label*='Detener'], button[aria-label*='Stop']",
  },
};

const STATE_KEY = "__neq6AiScraperState";
const state = globalThis[STATE_KEY] ?? (globalThis[STATE_KEY] = { contextPromise: null });

async function executablePath() {
  for (const path of CHROME_PATHS) {
    try { await access(path); return path; } catch { /* siguiente */ }
  }
  throw new Error("No se encontró Chrome ni Edge.");
}

async function browserContext() {
  const mode = process.env.NEQ6_AI_SHOW_BROWSER === "1" ? "visible" : "background";
  if (state.contextPromise && state.mode === mode) return state.contextPromise;
  if (state.contextPromise) {
    const previous = await state.contextPromise.catch(() => null);
    await previous?.close().catch(() => {});
    state.contextPromise = null;
  }
  state.mode = mode;
  state.contextPromise = (async () => {
    const { chromium } = await import("playwright-core");
    // Fuera del proyecto: Vite no debe intentar vigilar los ficheros de
    // cookies que Chromium mantiene bloqueados mientras el puente está activo.
    const profileRoot = process.env.LOCALAPPDATA || process.env.TEMP || process.cwd();
    const profile = resolve(profileRoot, "NEQ6-worm-gear", "ai-browser-profile");
    await mkdir(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: await executablePath(),
      headless: false,
      viewport: null,
      args: [
        "--no-first-run",
        "--disable-features=Translate",
        ...(mode === "background" ? ["--start-minimized", "--window-position=-32000,-32000", "--window-size=1280,900"] : []),
      ],
    });
    context.on("close", () => { state.contextPromise = null; });
    return context;
  })().catch((error) => { state.contextPromise = null; throw error; });
  return state.contextPromise;
}

function localRequest(request) {
  const address = request.socket.remoteAddress ?? "";
  return address === "127.0.0.1" || address === "::1" || address === "::ffff:127.0.0.1";
}

function readBody(request, limit = 512_000) {
  return new Promise((resolveBody, reject) => {
    let body = "";
    let settled = false;
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      if (settled) return;
      body += chunk;
      if (body.length > limit) {
        settled = true;
        reject(new Error("Solicitud demasiado grande."));
      }
    });
    request.on("end", () => {
      if (!settled) resolveBody(body);
    });
    request.on("error", (error) => {
      if (!settled) reject(error);
    });
  });
}

function customAdapter(provider) {
  const adapter = provider?.adapter;
  const url = new URL(provider?.url ?? "");
  if (url.protocol !== "https:") throw new Error("La IA personalizada requiere HTTPS.");
  for (const key of ["input", "send", "response"]) {
    if (typeof adapter?.[key] !== "string" || !adapter[key].trim() || adapter[key].length > 500) {
      throw new Error(`Falta el selector ${key}.`);
    }
  }
  return { url: url.href, input: adapter.input, send: adapter.send, response: adapter.response, stop: adapter.stop || "" };
}

function providerAdapter(provider) {
  const builtIn = BUILT_INS[provider?.id];
  if (!builtIn) return customAdapter(provider);
  const edited = provider?.adapter ?? {};
  const url = new URL(provider?.url || builtIn.url);
  if (url.protocol !== "https:") throw new Error("La IA requiere HTTPS.");
  return {
    ...builtIn,
    ...edited,
    url: url.href,
    stop: edited.stop ?? builtIn.stop ?? "",
  };
}

async function dismissCookies(page) {
  const names = [/Rechazar todo/i, /Reject all/i, /Sólo necesarias/i, /Only necessary/i, /Cerrar/i, /Close/i];
  for (const name of names) {
    const button = page.getByRole("button", { name }).first();
    if (await button.isVisible().catch(() => false)) {
      await button.click().catch(() => {});
      return;
    }
  }
}

async function waitStableResponse(page, adapter, initial, prompt) {
  const responses = page.locator(adapter.response);
  const turns = adapter.turns ? page.locator(adapter.turns) : null;
  let last = "";
  let stableAt = 0;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (adapter.blocked && await page.locator(adapter.blocked).count().catch(() => 0) > 0) {
      throw new Error("El proveedor ha mostrado una verificación o un límite de uso.");
    }
    const count = await responses.count().catch(() => 0);
    const responseText = count > 0 ? (await responses.last().innerText().catch(() => "")).trim() : "";
    const turnCount = turns ? await turns.count().catch(() => 0) : 0;
    const turnText = turns && turnCount >= initial.turnCount + 2
      ? (await turns.last().innerText().catch(() => "")).trim()
      : "";
    let bodyResponse = "";
    if (adapter.bodyAfterPrompt && !responseText && !turnText) {
      const bodyText = await page.locator("body").innerText().catch(() => "");
      const promptAt = bodyText.lastIndexOf(prompt);
      if (promptAt >= 0) {
        bodyResponse = bodyText.slice(promptAt + prompt.length).trim().replace(/^ChatGPT(?:\s+Plus)?\s*/i, "").trim();
        const footerAt = ["\n\nChatGPT es una IA", "\n\nChat con ChatGPT", "\n\nChatGPT can make mistakes"]
          .map((marker) => bodyResponse.indexOf(marker))
          .filter((index) => index >= 0)
          .sort((a, b) => a - b)[0];
        if (footerAt !== undefined) bodyResponse = bodyResponse.slice(0, footerAt).trim();
      }
    }
    const current = responseText || turnText || bodyResponse;
    const isNewResponse = count > initial.count || (responseText && responseText !== initial.text) || Boolean(turnText || bodyResponse);
    const generating = adapter.stop
      ? await page.locator(adapter.stop).filter({ visible: true }).count().catch(() => 0) > 0
      : false;
    if (isNewResponse && current === last && !generating) {
      if (!stableAt) stableAt = Date.now();
      if (Date.now() - stableAt >= 2500) return current;
    } else {
      last = current;
      stableAt = 0;
    }
    await page.waitForTimeout(500);
  }
  const count = await responses.count().catch(() => 0);
  throw new Error(`No se detectó una respuesta completa en tres minutos (coincidencias: ${count}).`);
}

async function submitPrompt(page, input, adapter) {
  const send = page.locator(adapter.send).filter({ visible: true }).first();
  try {
    await send.waitFor({ state: "visible", timeout: 5000 });
    await send.click();
  } catch {
    await input.press("Enter");
  }
}

async function run(provider, prompt) {
  const adapter = providerAdapter(provider);
  const context = await browserContext();
  const page = await context.newPage();
  try {
    await page.goto(adapter.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissCookies(page);
    const input = page.locator(adapter.input).filter({ visible: true }).first();
    await input.waitFor({ state: "visible", timeout: 45_000 });
    const responses = page.locator(adapter.response);
    const initialCount = await responses.count().catch(() => 0);
    const initialText = initialCount > 0 ? (await responses.last().innerText().catch(() => "")).trim() : "";
    const initialTurnCount = adapter.turns ? await page.locator(adapter.turns).count().catch(() => 0) : 0;
    await input.fill(prompt);
    const sendReady = await page.locator(adapter.send).filter({ visible: true }).count().catch(() => 0) > 0;
    if (!sendReady) {
      await input.fill("");
      await input.type(prompt, { delay: 0, timeout: 120_000 });
    }
    await submitPrompt(page, input, adapter);
    const response = await waitStableResponse(page, adapter, { count: initialCount, text: initialText, turnCount: initialTurnCount }, prompt);
    await page.close();
    return response;
  } catch (error) {
    const details = `${await page.title().catch(() => "sin título")} · ${page.url()}`;
    const pageText = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 300);
    await page.close().catch(() => {});
    throw new Error(`${String(error?.message ?? error)} [${details} · ${pageText}]`);
  }
}

async function probe(provider) {
  const adapter = providerAdapter(provider);
  const context = await browserContext();
  const page = await context.newPage();
  try {
    await page.goto(adapter.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await dismissCookies(page);
    const input = page.locator(adapter.input).filter({ visible: true });
    await input.first().waitFor({ state: "visible", timeout: 45_000 });
    return {
      title: await page.title(),
      url: page.url(),
      inputCount: await input.count(),
      blocked: adapter.blocked ? await page.locator(adapter.blocked).count().catch(() => 0) > 0 : false,
    };
  } catch (error) {
    const title = await page.title().catch(() => "sin título");
    const text = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").trim().slice(0, 240);
    throw new Error(`${String(error?.message ?? error)} [${title} · ${page.url()} · ${text}]`);
  } finally {
    await page.close().catch(() => {});
  }
}

export function aiScraperMiddleware() {
  return async (request, response, next) => {
    if (!request.url?.startsWith("/api/ai/")) return next();
    response.setHeader("Content-Type", "application/json; charset=utf-8");
    if (!localRequest(request)) {
      response.statusCode = 403;
      response.end(JSON.stringify({ ok: false, error: "El análisis IA sólo está disponible localmente." }));
      return;
    }
    if (request.method === "GET" && request.url === "/api/ai/status") {
      try {
        response.end(JSON.stringify({ ok: true, executablePath: await executablePath(), providers: Object.keys(BUILT_INS) }));
      } catch (error) {
        response.statusCode = 503;
        response.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
      }
      return;
    }
    if (request.method === "POST" && request.url === "/api/ai/run") {
      try {
        const payload = JSON.parse(await readBody(request));
        if (typeof payload.prompt !== "string" || !payload.prompt.trim()) throw new Error("Informe vacío.");
        const result = await run(payload.provider, payload.prompt);
        response.end(JSON.stringify({ ok: true, response: result }));
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
      }
      return;
    }
    if (request.method === "POST" && request.url === "/api/ai/probe") {
      try {
        const payload = JSON.parse(await readBody(request));
        response.end(JSON.stringify({ ok: true, ...(await probe(payload.provider)) }));
      } catch (error) {
        response.statusCode = 500;
        response.end(JSON.stringify({ ok: false, error: String(error?.message ?? error) }));
      }
      return;
    }
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: "Ruta desconocida." }));
  };
}
