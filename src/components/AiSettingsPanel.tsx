import { useState } from "react";
import { useAiSettings } from "../hooks/useAiAnalysis";

export default function AiSettingsPanel() {
  const [settings, setSettings] = useAiSettings();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [inputSelector, setInputSelector] = useState("");
  const [sendSelector, setSendSelector] = useState("");
  const [responseSelector, setResponseSelector] = useState("");
  const [stopSelector, setStopSelector] = useState("");
  const updateProvider = (id: string, update: Partial<(typeof settings.providers)[number]>) => {
    setSettings({ ...settings, providers: settings.providers.map((provider) => provider.id === id ? { ...provider, ...update } : provider) });
  };
  const updateAdapter = (id: string, key: "input" | "send" | "response" | "stop", value: string) => {
    setSettings({
      ...settings,
      providers: settings.providers.map((provider) => provider.id === id
        ? { ...provider, adapter: { input: "", send: "", response: "", ...provider.adapter, [key]: value } }
        : provider),
    });
  };
  const add = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    try {
      const parsed = new URL(trimmedUrl);
      if (!/^https?:$/.test(parsed.protocol) || !trimmedName) return;
      if (!inputSelector.trim() || !sendSelector.trim() || !responseSelector.trim()) return;
      setSettings({ ...settings, providers: [...settings.providers, {
        id: crypto.randomUUID(), name: trimmedName, url: parsed.href,
        adapter: { input: inputSelector.trim(), send: sendSelector.trim(), response: responseSelector.trim(), stop: stopSelector.trim() },
      }] });
      setName(""); setUrl("");
      setInputSelector(""); setSendSelector(""); setResponseSelector(""); setStopSelector("");
    } catch { /* URL incompleta: se conserva para que el usuario la corrija. */ }
  };
  return (
    <section className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim"><span className="h-[7px] w-[7px] bg-ion/80" />Análisis IA</h2>
        <label className="flex cursor-pointer items-center gap-2 font-mono text-[10px] text-fog">
          <input type="checkbox" checked={settings.enabled} onChange={(event) => setSettings({ ...settings, enabled: event.target.checked })} className="accent-[#4cc9f0]" />
          ACTIVAR
        </label>
      </div>
      {settings.enabled && (
        <div className="mt-3 space-y-2">
          {settings.providers.map((provider) => (
            <div key={provider.id} className="rounded border border-line bg-[#0c1930] p-2 font-mono text-[10px]">
              <div className="flex items-center gap-1.5">
                <input value={provider.name} onChange={(event) => updateProvider(provider.id, { name: event.target.value })} aria-label={`Nombre de ${provider.name}`} className="w-28 rounded border border-line bg-[#091426] px-2 py-1 text-fog focus:border-ion/60 focus:outline-none" />
                <input value={provider.url} onChange={(event) => updateProvider(provider.id, { url: event.target.value })} aria-label={`URL de ${provider.name}`} className="min-w-0 flex-1 rounded border border-line bg-[#091426] px-2 py-1 text-dim focus:border-ion/60 focus:outline-none" />
                <button onClick={() => setSettings({ ...settings, providers: settings.providers.filter((item) => item.id !== provider.id) })} className="px-1 text-dim hover:text-alert" aria-label={`Eliminar ${provider.name}`}>×</button>
              </div>
              <details className="mt-1.5 border-t border-line/60 pt-1.5">
                <summary className="cursor-pointer text-[9px] uppercase tracking-wider text-dim">Selectores de automatización</summary>
                <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  <input value={provider.adapter?.input ?? ""} onChange={(event) => updateAdapter(provider.id, "input", event.target.value)} placeholder="Selector del campo de entrada" className="rounded border border-line bg-[#091426] px-2 py-1 text-fog focus:border-ion/60 focus:outline-none" />
                  <input value={provider.adapter?.send ?? ""} onChange={(event) => updateAdapter(provider.id, "send", event.target.value)} placeholder="Selector del botón enviar" className="rounded border border-line bg-[#091426] px-2 py-1 text-fog focus:border-ion/60 focus:outline-none" />
                  <input value={provider.adapter?.response ?? ""} onChange={(event) => updateAdapter(provider.id, "response", event.target.value)} placeholder="Selector de la respuesta" className="rounded border border-line bg-[#091426] px-2 py-1 text-fog focus:border-ion/60 focus:outline-none" />
                  <input value={provider.adapter?.stop ?? ""} onChange={(event) => updateAdapter(provider.id, "stop", event.target.value)} placeholder="Selector de generación (opcional)" className="rounded border border-line bg-[#091426] px-2 py-1 text-fog focus:border-ion/60 focus:outline-none" />
                </div>
              </details>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={inputSelector} onChange={(event) => setInputSelector(event.target.value)} placeholder="Selector del campo de entrada" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={sendSelector} onChange={(event) => setSendSelector(event.target.value)} placeholder="Selector del botón enviar" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={responseSelector} onChange={(event) => setResponseSelector(event.target.value)} placeholder="Selector de la respuesta" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={stopSelector} onChange={(event) => setStopSelector(event.target.value)} placeholder="Selector de generación (opcional)" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <button onClick={add} className="rounded border border-ion/50 px-3 py-1.5 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/10 sm:col-span-2">AÑADIR IA</button>
          </div>
        </div>
      )}
    </section>
  );
}
