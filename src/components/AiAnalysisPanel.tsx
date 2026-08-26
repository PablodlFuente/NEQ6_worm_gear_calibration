import { useEffect, useMemo, useState } from "react";
import { analysisFingerprint, getAiResponse, saveAiResponse, useAiSettings } from "../hooks/useAiAnalysis";

export default function AiAnalysisPanel({ prompt }: { prompt: string }) {
  const [settings] = useAiSettings();
  const [providerId, setProviderId] = useState(settings.providers[0]?.id ?? "");
  const fingerprint = useMemo(() => analysisFingerprint(prompt), [prompt]);
  const provider = settings.providers.find((item) => item.id === providerId) ?? settings.providers[0];
  const [response, setResponse] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [bridgeReady, setBridgeReady] = useState(false);
  const [runningRequest, setRunningRequest] = useState<string | null>(null);

  useEffect(() => {
    if (!provider && settings.providers[0]) setProviderId(settings.providers[0].id);
  }, [provider, settings.providers]);
  useEffect(() => {
    if (!provider) { setResponse(""); setSavedAt(null); return; }
    const saved = getAiResponse(provider.id, fingerprint);
    setResponse(saved?.text ?? "");
    setSavedAt(saved?.updatedAt ?? null);
  }, [provider?.id, fingerprint]);
  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== location.origin || event.data?.source !== "neq6-ai-bridge") return;
      if (event.data.type === "NEQ6_AI_BRIDGE_READY") {
        setBridgeReady(true);
        return;
      }
      if (event.data.type !== "NEQ6_AI_RESULT" || event.data.requestId !== runningRequest) return;
      setRunningRequest(null);
      if (!event.data.result?.ok) {
        setNotice(event.data.result?.error ?? "El chat no devolvió respuesta.");
        return;
      }
      const text = String(event.data.result.response ?? "").trim();
      setResponse(text);
      if (provider && text) {
        const saved = saveAiResponse(provider.id, fingerprint, text);
        setSavedAt(saved.updatedAt);
      }
      setNotice("Análisis recibido y guardado.");
    };
    window.addEventListener("message", receive);
    window.postMessage({ source: "neq6-ai-app", type: "NEQ6_AI_BRIDGE_PING" }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, [fingerprint, provider?.id, runningRequest]);

  const providerUrl = (target: NonNullable<typeof provider>) => {
    const url = new URL(target.url);
    // ChatGPT admite oficialmente en su interfaz web precargar el compositor
    // mediante ?q=. Qwen y Gemini ignoran los parámetros equivalentes.
    if ((url.hostname === "chatgpt.com" || url.hostname === "www.chatgpt.com") && prompt.length <= 12_000) {
      url.searchParams.set("q", prompt);
    }
    return url.href;
  };
  const copyAndOpen = async (target = provider) => {
    if (!target || !prompt) return;
    await navigator.clipboard.writeText(prompt);
    window.open(providerUrl(target), "_blank", "noopener,noreferrer");
    const direct = new URL(target.url).hostname.replace(/^www\./, "") === "chatgpt.com" && prompt.length <= 12_000;
    setNotice(direct ? `Informe precargado en ${target.name}.` : `Informe copiado · ${target.name} abierto.`);
  };
  const openAll = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    settings.providers.forEach((item) => window.open(providerUrl(item), "_blank", "noopener,noreferrer"));
    setNotice(`Informe copiado · abiertos ${settings.providers.length} chats.`);
  };
  const runAutomatic = () => {
    if (!provider || !["chatgpt", "qwen", "gemini"].includes(provider.id)) return;
    const requestId = crypto.randomUUID();
    setRunningRequest(requestId);
    setNotice(`Esperando respuesta de ${provider.name}…`);
    window.postMessage({
      source: "neq6-ai-app",
      type: "NEQ6_AI_RUN",
      requestId,
      providerId: provider.id,
      prompt,
    }, location.origin);
  };
  const paste = async () => {
    const text = await navigator.clipboard.readText();
    setResponse(text);
    setNotice("Respuesta pegada; falta guardarla.");
  };
  const save = () => {
    if (!provider || !response.trim()) return;
    const saved = saveAiResponse(provider.id, fingerprint, response.trim());
    setSavedAt(saved.updatedAt);
    setNotice("Respuesta guardada para este ensayo.");
  };

  if (!prompt) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">No hay resultados que analizar.</p>;
  if (!provider) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">Añade una IA desde Ajustes.</p>;

  return (
    <div className="space-y-2">
      <section className="rounded border border-line bg-[#091426]/70 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 font-mono text-[9px] uppercase tracking-wider text-dim">IA
            <select value={provider.id} onChange={(event) => setProviderId(event.target.value)} className="mt-1 w-full rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10.5px] text-fog focus:border-ion/60 focus:outline-none">
              {settings.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {bridgeReady && ["chatgpt", "qwen", "gemini"].includes(provider.id) && (
            <button onClick={runAutomatic} disabled={Boolean(runningRequest)} className="rounded border border-mint/50 bg-mint/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-mint hover:bg-mint/20 disabled:opacity-40">
              {runningRequest ? "ANALIZANDO…" : "ANALIZAR AUTOMÁTICAMENTE"}
            </button>
          )}
          <button onClick={() => void copyAndOpen()} className="rounded border border-ion/50 bg-ion/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/20">COPIAR Y ABRIR</button>
          <button onClick={() => void openAll()} className="rounded border border-line px-3 py-2 font-display text-[9px] font-bold tracking-wider text-fog hover:border-ember/50 hover:text-ember">ABRIR TODAS</button>
        </div>
        {!bridgeReady && <p className="mt-2 font-mono text-[9px] text-dim">Automatización no detectada · instala el puente desde Ajustes.</p>}
        <details className="mt-2 rounded border border-line/70">
          <summary className="cursor-pointer px-2 py-1.5 font-mono text-[9px] text-dim">Informe enviado · {fingerprint}</summary>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-t border-line p-2 font-mono text-[9px] text-fog">{prompt}</pre>
        </details>
      </section>
      <section className="rounded border border-line bg-[#091426]/70 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-display text-[10px] font-bold uppercase tracking-[0.16em] text-fog">Respuesta · {provider.name}</h3>
          {savedAt && <span className="font-mono text-[9px] text-mint">guardada {new Date(savedAt).toLocaleString("es-ES")}</span>}
          <button onClick={() => void paste()} className="rounded border border-line px-2 py-1 font-display text-[9px] font-bold text-fog hover:border-ion/50 hover:text-ion">PEGAR</button>
          <button onClick={save} className="rounded border border-mint/50 px-2 py-1 font-display text-[9px] font-bold text-mint hover:bg-mint/10">GUARDAR</button>
          <button onClick={() => void copyAndOpen()} className="rounded border border-ember/50 px-2 py-1 font-display text-[9px] font-bold text-ember hover:bg-ember/10">RECALCULAR</button>
        </div>
        <textarea value={response} onChange={(event) => setResponse(event.target.value)} placeholder="Pega aquí la respuesta del chat." className="min-h-72 w-full resize-y rounded border border-line bg-[#07101e] p-2 font-mono text-[10.5px] leading-relaxed text-fog focus:border-ion/60 focus:outline-none" />
        {notice && <p className="mt-1.5 font-mono text-[9px] text-dim">{notice}</p>}
      </section>
    </div>
  );
}
