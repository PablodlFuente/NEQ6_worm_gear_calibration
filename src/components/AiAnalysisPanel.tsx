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

  useEffect(() => {
    if (!provider && settings.providers[0]) setProviderId(settings.providers[0].id);
  }, [provider, settings.providers]);
  useEffect(() => {
    if (!provider) { setResponse(""); setSavedAt(null); return; }
    const saved = getAiResponse(provider.id, fingerprint);
    setResponse(saved?.text ?? "");
    setSavedAt(saved?.updatedAt ?? null);
  }, [provider?.id, fingerprint]);

  const copyAndOpen = async (target = provider) => {
    if (!target || !prompt) return;
    await navigator.clipboard.writeText(prompt);
    window.open(target.url, "_blank", "noopener,noreferrer");
    setNotice(`Informe copiado · ${target.name} abierto.`);
  };
  const openAll = async () => {
    if (!prompt) return;
    await navigator.clipboard.writeText(prompt);
    settings.providers.forEach((item) => window.open(item.url, "_blank", "noopener,noreferrer"));
    setNotice(`Informe copiado · abiertos ${settings.providers.length} chats.`);
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
          <button onClick={() => void copyAndOpen()} className="rounded border border-ion/50 bg-ion/10 px-3 py-2 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/20">COPIAR Y ABRIR</button>
          <button onClick={() => void openAll()} className="rounded border border-line px-3 py-2 font-display text-[9px] font-bold tracking-wider text-fog hover:border-ember/50 hover:text-ember">ABRIR TODAS</button>
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
