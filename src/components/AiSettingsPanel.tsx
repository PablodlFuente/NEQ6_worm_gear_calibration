import { useState } from "react";
import { type AiProvider, useAiSettings } from "../hooks/useAiAnalysis";

type Draft = { id: string; name: string; url: string; input: string; send: string; response: string; stop: string };
const emptyDraft = (): Draft => ({ id: crypto.randomUUID(), name: "", url: "https://", input: "", send: "", response: "", stop: "" });
const providerDraft = (provider: AiProvider): Draft => ({
  id: provider.id, name: provider.name, url: provider.url,
  input: provider.adapter?.input ?? "", send: provider.adapter?.send ?? "",
  response: provider.adapter?.response ?? "", stop: provider.adapter?.stop ?? "",
});

export default function AiSettingsPanel() {
  const [settings, setSettings] = useAiSettings();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const openNew = () => { setDraft(emptyDraft()); setEditingId(null); setError(""); };
  const openEdit = (provider: AiProvider) => { setDraft(providerDraft(provider)); setEditingId(provider.id); setError(""); };
  const close = () => { setDraft(null); setEditingId(null); setError(""); };
  const save = () => {
    if (!draft) return;
    try {
      const parsed = new URL(draft.url.trim());
      if (parsed.protocol !== "https:") throw new Error("La URL debe usar HTTPS.");
      if (!draft.name.trim()) throw new Error("Falta el nombre.");
      if (!draft.input.trim() || !draft.send.trim() || !draft.response.trim()) throw new Error("Entrada, envío y respuesta requieren un selector CSS.");
      const provider: AiProvider = {
        id: draft.id, name: draft.name.trim(), url: parsed.href,
        adapter: { input: draft.input.trim(), send: draft.send.trim(), response: draft.response.trim(), stop: draft.stop.trim() },
      };
      const providers = editingId
        ? settings.providers.map((item) => item.id === editingId ? provider : item)
        : [...settings.providers, provider];
      setSettings({ ...settings, providers });
      close();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Configuración no válida."); }
  };
  const field = (key: keyof Draft, label: string, help: string, required = true) => draft && (
    <label className="font-mono text-[9px] uppercase tracking-wider text-dim" title={help}>
      {label}{required ? "" : " · opcional"}
      <input value={draft[key]} onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
        className="mt-1 w-full rounded border border-line bg-[#091426] px-2 py-1.5 text-[10px] normal-case tracking-normal text-fog focus:border-ion/60 focus:outline-none" />
    </label>
  );

  return (
    <section className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim"><span className="h-[7px] w-[7px] bg-ion/80" />Análisis IA</h2>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[9px] text-fog" title="Conserva este ajuste en el navegador.">
          <span>{settings.enabled ? "ON" : "OFF"}</span>
          <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} className="peer sr-only" />
          <span className="relative h-5 w-10 rounded-full border border-line bg-[#091426] transition peer-checked:border-mint/70 peer-checked:bg-mint/20">
            <span className="absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-dim transition-transform peer-checked:translate-x-5 peer-checked:bg-mint" />
          </span>
        </label>
      </div>
      {settings.enabled && <div className="mt-3 space-y-2">
        {settings.providers.map((provider) => <div key={provider.id} className="flex items-center gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px]">
          <span className="w-24 shrink-0 text-fog">{provider.name}</span>
          <span className="min-w-0 flex-1 truncate text-dim" title={provider.url}>{provider.url}</span>
          <button onClick={() => openEdit(provider)} className="rounded border border-line px-1.5 py-0.5 text-ion hover:border-ion/60" aria-label={`Editar ${provider.name}`} title="Editar proveedor y selectores CSS">✎</button>
          <button onClick={() => setSettings({ ...settings, providers: settings.providers.filter((item) => item.id !== provider.id) })} className="px-1 text-dim hover:text-alert" aria-label={`Eliminar ${provider.name}`} title="Eliminar proveedor">×</button>
        </div>)}
        <button onClick={openNew} className="w-full rounded border border-ion/50 px-3 py-1.5 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/10">+ AÑADIR IA</button>
      </div>}
      {draft && <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-label={editingId ? "Editar IA" : "Añadir IA"}>
        <section className="w-full max-w-2xl rounded border border-ion/40 bg-panel p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-display text-[11px] font-bold uppercase tracking-[0.18em] text-fog">{editingId ? "Editar IA" : "Añadir IA"}</h3>
            <button onClick={close} className="rounded border border-line px-2 py-1 font-mono text-[9px] text-dim hover:text-fog">CERRAR</button>
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {field("name", "Nombre", "Nombre que aparecerá en el selector de análisis.")}
            {field("url", "URL del chat", "Dirección HTTPS de la página del chat.")}
            {field("input", "Selector de entrada", "Selector CSS del textarea o elemento contenteditable donde se escribe el informe.")}
            {field("send", "Selector de envío", "Selector CSS del botón que envía el mensaje.")}
            {field("response", "Selector de respuesta", "Selector CSS que identifica cada respuesta generada por el modelo.")}
            {field("stop", "Selector de generación", "Selector CSS del botón visible mientras el modelo está generando; permite detectar el final.", false)}
          </div>
          {error && <p className="mt-2 font-mono text-[9px] text-alert">{error}</p>}
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={close} className="rounded border border-line px-3 py-1.5 font-display text-[9px] tracking-wider text-dim">CANCELAR</button>
            <button onClick={save} className="rounded border border-mint/60 bg-mint/10 px-3 py-1.5 font-display text-[9px] font-bold tracking-wider text-mint">GUARDAR</button>
          </div>
        </section>
      </div>}
    </section>
  );
}
