import { useEffect, useMemo, useRef, useState } from "react";
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
  const [runningProviders, setRunningProviders] = useState<Set<string>>(() => new Set());
  const pendingRef = useRef(new Map<string, { providerId: string; fingerprint: string }>());

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
      if (event.data.type !== "NEQ6_AI_RESULT") return;
      const pending = pendingRef.current.get(event.data.requestId);
      if (!pending) return;
      pendingRef.current.delete(event.data.requestId);
      setRunningProviders((current) => {
        const next = new Set(current); next.delete(pending.providerId); return next;
      });
      if (!event.data.result?.ok) {
        setNotice(event.data.result?.error ?? "El chat no devolvió respuesta.");
        return;
      }
      const text = String(event.data.result.response ?? "").trim();
      if (text) {
        const saved = saveAiResponse(pending.providerId, pending.fingerprint, text);
        if (pending.providerId === provider?.id) {
          setResponse(text);
          setSavedAt(saved.updatedAt);
        }
      }
      setNotice("Análisis recibido y guardado.");
    };
    window.addEventListener("message", receive);
    window.postMessage({ source: "neq6-ai-app", type: "NEQ6_AI_BRIDGE_PING" }, location.origin);
    return () => window.removeEventListener("message", receive);
  }, [provider?.id]);

  const runAutomatic = (target = provider) => {
    if (!target || !["chatgpt", "qwen", "gemini"].includes(target.id)) return;
    const requestId = crypto.randomUUID();
    pendingRef.current.set(requestId, { providerId: target.id, fingerprint });
    setRunningProviders((current) => new Set(current).add(target.id));
    setNotice(`Esperando respuesta de ${target.name}…`);
    window.postMessage({
      source: "neq6-ai-app",
      type: "NEQ6_AI_RUN",
      requestId,
      providerId: target.id,
      prompt,
    }, location.origin);
  };
  const runAll = () => settings.providers.filter((item) => ["chatgpt", "qwen", "gemini"].includes(item.id)).forEach((item) => runAutomatic(item));

  if (!prompt) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">No hay resultados que analizar.</p>;
  if (!provider) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">Añade una IA desde Ajustes.</p>;

  if (!bridgeReady) return (
    <section className="rounded border border-line bg-[#091426]/70 p-5 text-center">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-fog">Puente automático no detectado</h3>
      <p className="mx-auto mt-2 max-w-xl font-mono text-[10px] text-dim">Instala la extensión local y recarga esta página. Después el programa enviará el informe y recuperará la respuesta automáticamente.</p>
      <a href="/neq6-ai-browser-bridge.zip" download className="mx-auto mt-4 flex w-fit items-center justify-center rounded border border-mint/50 bg-mint/10 px-4 py-2 font-display text-[9px] font-bold tracking-wider text-mint hover:bg-mint/20">DESCARGAR PUENTE AUTOMÁTICO</a>
      <ol className="mx-auto mt-4 max-w-lg list-decimal space-y-1 text-left font-mono text-[9.5px] text-dim">
        <li>Descomprime el ZIP.</li>
        <li>Abre las extensiones del navegador y activa el modo desarrollador.</li>
        <li>Carga la carpeta descomprimida y recarga esta página.</li>
      </ol>
    </section>
  );

  return (
    <div className="space-y-2">
      <section className="rounded border border-line bg-[#091426]/70 p-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-48 flex-1 font-mono text-[9px] uppercase tracking-wider text-dim">IA
            <select value={provider.id} onChange={(event) => setProviderId(event.target.value)} className="mt-1 w-full rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10.5px] text-fog focus:border-ion/60 focus:outline-none">
              {settings.providers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {["chatgpt", "qwen", "gemini"].includes(provider.id) ? (
            <button onClick={() => runAutomatic()} disabled={runningProviders.has(provider.id)} className="rounded border border-mint/50 bg-mint/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-mint hover:bg-mint/20 disabled:opacity-40">
              {runningProviders.has(provider.id) ? "ANALIZANDO…" : "ANALIZAR"}
            </button>
          ) : <span className="font-mono text-[9px] text-alert">Proveedor sin adaptador automático.</span>}
          <button onClick={runAll} disabled={runningProviders.size > 0} className="rounded border border-ion/50 bg-ion/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/20 disabled:opacity-40">ANALIZAR CON TODAS</button>
        </div>
        <details className="mt-2 rounded border border-line/70">
          <summary className="cursor-pointer px-2 py-1.5 font-mono text-[9px] text-dim">Informe enviado · {fingerprint}</summary>
          <pre className="max-h-60 overflow-auto whitespace-pre-wrap border-t border-line p-2 font-mono text-[9px] text-fog">{prompt}</pre>
        </details>
      </section>
      <section className="rounded border border-line bg-[#091426]/70 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="mr-auto font-display text-[10px] font-bold uppercase tracking-[0.16em] text-fog">Respuesta · {provider.name}</h3>
          {savedAt && <span className="font-mono text-[9px] text-mint">guardada {new Date(savedAt).toLocaleString("es-ES")}</span>}
          <button onClick={() => runAutomatic()} disabled={runningProviders.has(provider.id)} className="rounded border border-ember/50 px-2 py-1 font-display text-[9px] font-bold text-ember hover:bg-ember/10 disabled:opacity-40">RECALCULAR</button>
        </div>
        <textarea value={response} readOnly placeholder="La respuesta automática aparecerá aquí." className="min-h-72 w-full resize-y rounded border border-line bg-[#07101e] p-2 font-mono text-[10.5px] leading-relaxed text-fog focus:outline-none" />
        {notice && <p className="mt-1.5 font-mono text-[9px] text-dim">{notice}</p>}
      </section>
    </div>
  );
}
