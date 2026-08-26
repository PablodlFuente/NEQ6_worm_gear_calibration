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
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [runningProviders, setRunningProviders] = useState<Set<string>>(() => new Set());

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
    void fetch("/api/ai/status").then((response) => setServiceReady(response.ok)).catch(() => setServiceReady(false));
  }, []);

  const runAutomatic = async (target = provider) => {
    if (!target) return;
    setRunningProviders((current) => new Set(current).add(target.id));
    setNotice(`Esperando respuesta de ${target.name}…`);
    try {
      const request = await fetch("/api/ai/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: target, prompt }),
      });
      const result = await request.json();
      if (!request.ok || !result.ok) throw new Error(result.error ?? "El chat no devolvió respuesta.");
      const text = String(result.response ?? "").trim();
      const saved = saveAiResponse(target.id, fingerprint, text);
      if (target.id === provider?.id) {
        setResponse(text);
        setSavedAt(saved.updatedAt);
      }
      setNotice(`Análisis de ${target.name} recibido y guardado.`);
    } catch (error) {
      setNotice(String(error instanceof Error ? error.message : error));
    } finally {
      setRunningProviders((current) => {
        const next = new Set(current); next.delete(target.id); return next;
      });
    }
  };
  const runAll = () => settings.providers.forEach((item) => void runAutomatic(item));

  if (!prompt) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">No hay resultados que analizar.</p>;
  if (!provider) return <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">Añade una IA desde Ajustes.</p>;

  if (serviceReady === false) return (
    <section className="rounded border border-line bg-[#091426]/70 p-5 text-center">
      <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-fog">Servicio local de análisis no disponible</h3>
      <p className="mx-auto mt-2 max-w-xl font-mono text-[10px] text-dim">Inicia la aplicación mediante su servidor local y recarga esta página.</p>
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
          <button onClick={() => void runAutomatic()} disabled={serviceReady !== true || runningProviders.has(provider.id)} className="rounded border border-mint/50 bg-mint/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-mint hover:bg-mint/20 disabled:opacity-40">
            {runningProviders.has(provider.id) ? "ANALIZANDO…" : "ANALIZAR"}
          </button>
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
          <button onClick={() => void runAutomatic()} disabled={runningProviders.has(provider.id)} className="rounded border border-ember/50 px-2 py-1 font-display text-[9px] font-bold text-ember hover:bg-ember/10 disabled:opacity-40">RECALCULAR</button>
        </div>
        <textarea value={response} readOnly placeholder="La respuesta automática aparecerá aquí." className="min-h-72 w-full resize-y rounded border border-line bg-[#07101e] p-2 font-mono text-[10.5px] leading-relaxed text-fog focus:outline-none" />
        {notice && <p className="mt-1.5 font-mono text-[9px] text-dim">{notice}</p>}
      </section>
    </div>
  );
}
