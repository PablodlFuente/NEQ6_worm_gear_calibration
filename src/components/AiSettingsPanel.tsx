import { useState } from "react";
import { useAiSettings } from "../hooks/useAiAnalysis";

export default function AiSettingsPanel() {
  const [settings, setSettings] = useAiSettings();
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const add = () => {
    const trimmedName = name.trim();
    const trimmedUrl = url.trim();
    try {
      const parsed = new URL(trimmedUrl);
      if (!/^https?:$/.test(parsed.protocol) || !trimmedName) return;
      setSettings({ ...settings, providers: [...settings.providers, { id: crypto.randomUUID(), name: trimmedName, url: parsed.href }] });
      setName(""); setUrl("");
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
            <div key={provider.id} className="flex items-center gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px]">
              <span className="min-w-20 text-fog">{provider.name}</span>
              <span className="min-w-0 flex-1 truncate text-dim">{provider.url}</span>
              <button onClick={() => setSettings({ ...settings, providers: settings.providers.filter((item) => item.id !== provider.id) })} className="text-dim hover:text-alert" aria-label={`Eliminar ${provider.name}`}>×</button>
            </div>
          ))}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[0.7fr_1.5fr_auto]">
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Nombre" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://…" className="rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10px] text-fog focus:border-ion/60 focus:outline-none" />
            <button onClick={add} className="rounded border border-ion/50 px-3 py-1.5 font-display text-[9px] font-bold tracking-wider text-ion hover:bg-ion/10">AÑADIR</button>
          </div>
        </div>
      )}
    </section>
  );
}

