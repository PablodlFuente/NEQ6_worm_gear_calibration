import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const CHROME_PATHS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];

const BUILT_INS = {
  chatgpt: {
    url: "https://chatgpt.com/",
    input: "#prompt-textarea, #mobile-composer-prompt, textarea[placeholder*='ChatGPT']",
    send: "button[data-testid='send-button'], button[aria-label='Enviar mensaje'], button[aria-label='Send message']",
    response: "[data-message-author-role='assistant']",
    stop: "button[data-testid='stop-button'], button[aria-label*='Detener'], button[aria-label*='Stop']",
  },
  qwen: {
    url: "https://chat.qwen.ai/",
    input: "textarea.message-input-textarea, textarea[placeholder*='Qwen']",
    send: "button.send-button, button[aria-label='Enviar'], button[aria-label='Send']",
    response: ".message-content, .chat-message.assistant, [data-role='assistant']",
    stop: "button[aria-label*='Detener'], button[aria-label*='Stop'], .stop-button",
  },
  gemini: {
    url: "https://gemini.google.com/app",
    input: "rich-textarea [contenteditable='true'], div[contenteditable='true']",
    send: "button[aria-label='Enviar mensaje'], button[aria-label*='Enviar'], button[aria-label*='Send']",
    response: "model-response .markdown, model-response, .model-response-text, message-content",
    stop: "button[aria-label*='Detener'], button[aria-label*='Stop']",
  },
};

let contextPromise = null;

async function executablePath() {
  for (const path of CHROME_PATHS) {
    try { await access(path); return path; } catch { /* siguiente */ }
  }
  throw new Error("No se encontró Chrome ni Edge.");
}

async function browserContext() {
  if (contextPromise) return contextPromise;
  contextPromise = (async () => {
    const { chromium } = await import("playwright-core");
    const profile = resolve(process.cwd(), ".tools", "ai-browser-profile");
    await mkdir(profile, { recursive: true });
    const context = await chromium.launchPersistentContext(profile, {
      executablePath: await executablePath(),
      headless: false,
      viewport: null,
      args: ["--no-first-run", "--disable-features=Translate"],
    });
    context.on("close", () => { contextPromise = null; });
    return context;
  })().catch((error) => { contextPromise = null; throw error; });
  return contextPromise;
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

async function waitStableResponse(page, adapter, initialCount, initialText) {
  const responses = page.locator(adapter.response);
  let last = "";
  let stableAt = 0;
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const count = await responses.count().catch(() => 0);
    const current = count > 0 ? (await responses.last().innerText().catch(() => "")).trim() : "";
    const isNewResponse = count > initialCount || (current && current !== initialText);
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
  throw new Error("No se obtuvo una respuesta completa en tres minutos.");
}

async function run(provider, prompt) {
  const adapter = BUILT_INS[provider.id] ?? customAdapter(provider);
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
    await input.fill(prompt);
    const send = page.locator(adapter.send).filter({ visible: true }).first();
    await send.waitFor({ state: "visible", timeout: 15_000 });
    await send.click();
    const response = await waitStableResponse(page, adapter, initialCount, initialText);
    await page.close();
    return response;
  } catch (error) {
    await page.bringToFront().catch(() => {});
    throw error;
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
    response.statusCode = 404;
    response.end(JSON.stringify({ ok: false, error: "Ruta desconocida." }));
  };
}
