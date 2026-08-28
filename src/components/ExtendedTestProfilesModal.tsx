import { useEffect, useState } from "react";
import {
  cloneExtendedProfile,
  newExtendedStepId,
  sanitizeExtendedProfile,
  type ExtendedTestProfile,
  type ExtendedTestStep,
} from "../lib/extendedTestProfiles";

interface Props {
  open: boolean;
  profiles: ExtendedTestProfile[];
  selectedId: string;
  onProfiles: (profiles: ExtendedTestProfile[]) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}

const field = "rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[11px] text-fog focus:border-ember/70 focus:outline-none";
const button = "rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.12em] text-dim transition-colors hover:border-ember/60 hover:text-fog";
const interfaceHelp = "Interfaz usa el valor actual de Parámetros del test en la pestaña Test ejes en el momento de ejecutar el perfil.";

const freshProfile = (): ExtendedTestProfile => ({
  id: `perfil-${Date.now()}`,
  name: "Nuevo perfil",
  steps: [{ id: newExtendedStepId(), kind: "motion", name: "Movimiento", axis: 1, direction: "cw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 }],
});

export default function ExtendedTestProfilesModal({ open, profiles, selectedId, onProfiles, onSelect, onClose }: Props) {
  const [editingId, setEditingId] = useState(selectedId);
  const [draft, setDraft] = useState<ExtendedTestProfile | null>(null);
  const [profileMenu, setProfileMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  useEffect(() => {
    if (!open) return;
    const profile = profiles.find((item) => item.id === editingId) ?? profiles.find((item) => item.id === selectedId) ?? profiles[0];
    if (profile) {
      setEditingId(profile.id);
      setDraft(cloneExtendedProfile(profile));
    }
  }, [open, editingId, selectedId]);
  useEffect(() => {
    if (!open || !draft || !draft.name.trim() || !draft.steps.length) return;
    const timer = window.setTimeout(() => {
      const valid = sanitizeExtendedProfile(draft);
      if (!valid) return;
      const stored = profiles.find((profile) => profile.id === valid.id);
      if (stored && JSON.stringify(stored) === JSON.stringify(valid)) return;
      const next = stored
        ? profiles.map((profile) => profile.id === valid.id ? cloneExtendedProfile(valid) : profile)
        : [...profiles, cloneExtendedProfile(valid)];
      onProfiles(next);
      onSelect(valid.id);
    }, 220);
    return () => window.clearTimeout(timer);
  }, [open, draft, profiles, onProfiles, onSelect]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (profileMenu) setProfileMenu(null);
      else onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose, profileMenu]);
  if (!open || !draft) return null;

  const patchStep = (id: string, patch: Partial<ExtendedTestStep>) => setDraft((current) => current && ({
    ...current,
    steps: current.steps.map((step) => step.id === id ? ({ ...step, ...patch } as ExtendedTestStep) : step),
  }));
  const replaceKind = (step: ExtendedTestStep, kind: ExtendedTestStep["kind"]) => {
    const common = { id: step.id, name: step.name, axis: step.axis, sampleRateHz: step.sampleRateHz };
    patchStep(step.id, kind === "stationary"
      ? { ...common, kind, durationSec: 20 }
      : { ...common, kind, direction: "cw", speedDegS: 3.34, revolutions: 1 });
  };
  const moveStep = (index: number, offset: -1 | 1) => setDraft((current) => {
    if (!current || index + offset < 0 || index + offset >= current.steps.length) return current;
    const steps = [...current.steps];
    [steps[index], steps[index + offset]] = [steps[index + offset], steps[index]];
    return { ...current, steps };
  });
  const add = () => {
    const profile = freshProfile();
    onProfiles([...profiles, profile]);
    onSelect(profile.id);
    setEditingId(profile.id);
    setDraft(cloneExtendedProfile(profile));
  };
  const remove = (id: string) => {
    if (profiles.length <= 1 || !window.confirm("¿Eliminar este perfil de test extendido?")) return;
    const next = profiles.filter((profile) => profile.id !== id);
    onProfiles(next);
    onSelect(next[0].id);
    setEditingId(next[0].id);
  };
  const duplicate = (id: string) => {
    const source = profiles.find((profile) => profile.id === id);
    if (!source) return;
    const copy: ExtendedTestProfile = {
      ...cloneExtendedProfile(source),
      id: `perfil-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: `${source.name} (copia)`,
      steps: source.steps.map((step) => ({ ...step, id: newExtendedStepId() })),
    };
    onProfiles([...profiles, copy]);
    onSelect(copy.id);
    setEditingId(copy.id);
    setDraft(cloneExtendedProfile(copy));
    setProfileMenu(null);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#020711]/90 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
      <section className="flex h-[min(94vh,920px)] w-[min(96vw,1500px)] min-h-0 flex-col overflow-hidden rounded-md border border-ember/45 bg-[#071120] shadow-[0_0_45px_rgba(0,0,0,0.7)]">
        <header className="flex shrink-0 items-center border-b border-line px-4 py-3">
          <div>
            <h2 className="font-display text-[13px] font-bold uppercase tracking-[0.22em] text-fog">Configuración del test extendido</h2>
            <p className="mt-1 font-mono text-[10px] text-dim">Perfiles persistentes y secuencias ejecutadas en el orden indicado.</p>
          </div>
          <button onClick={onClose} className={`${button} ml-auto`}>CERRAR · ESC</button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[360px_minmax(0,1fr)] max-lg:grid-cols-[310px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-line bg-[#081120] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Perfiles</span>
              <button onClick={add} className={button}>+ AÑADIR</button>
            </div>
            <div className="grid gap-1.5">
              {profiles.map((profile) => (
                <div key={profile.id} onContextMenu={(event) => {
                  event.preventDefault();
                  setEditingId(profile.id);
                  onSelect(profile.id);
                  setProfileMenu({ id: profile.id, x: Math.min(event.clientX, window.innerWidth - 190), y: Math.min(event.clientY, window.innerHeight - 60) });
                }} className={`flex items-center rounded border ${editingId === profile.id ? "border-ember/60 bg-ember/10" : "border-line bg-[#0c1930]"}`}>
                  <button className="min-w-0 flex-1 truncate px-2 py-2 text-left font-mono text-[10.5px] text-fog" onClick={() => { setEditingId(profile.id); onSelect(profile.id); }}> {profile.name}</button>
                  <button title="Editar" aria-label={`Editar ${profile.name}`} className="px-2 text-ion" onClick={() => setEditingId(profile.id)}>✎</button>
                  <button title="Eliminar" aria-label={`Eliminar ${profile.name}`} className="px-2 text-alert disabled:opacity-25" disabled={profiles.length <= 1} onClick={() => remove(profile.id)}>×</button>
                </div>
              ))}
            </div>
          </aside>
          <main className="min-h-0 overflow-y-auto p-4">
            <label className="block font-mono text-[9.5px] uppercase tracking-[0.13em] text-dim">
              Nombre del perfil
              <input className={`${field} mt-1 w-full`} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
            </label>
            <div className="mt-4 grid gap-2">
              {draft.steps.map((step, index) => (
                <article key={step.id} className="rounded border border-line bg-panel p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-display text-[10px] font-bold text-ember">PASO {index + 1}</span>
                    <input aria-label={`Nombre del paso ${index + 1}`} className={`${field} min-w-0 flex-1`} value={step.name} onChange={(event) => patchStep(step.id, { name: event.target.value })} />
                    <button className={button} disabled={index === 0} onClick={() => moveStep(index, -1)}>↑</button>
                    <button className={button} disabled={index === draft.steps.length - 1} onClick={() => moveStep(index, 1)}>↓</button>
                    <button className={`${button} text-alert`} onClick={() => setDraft({ ...draft, steps: draft.steps.filter((item) => item.id !== step.id) })}>×</button>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-6">
                    <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Acción<select className={field} value={step.kind} onChange={(event) => replaceKind(step, event.target.value as ExtendedTestStep["kind"])}><option value="motion">Mover eje</option><option value="stationary">Medición de ruido</option></select></label>
                    <label title={interfaceHelp} className="grid cursor-help gap-1 text-[9px] uppercase tracking-wider text-dim">Eje<select className={field} value={step.axis} onChange={(event) => patchStep(step.id, { axis: event.target.value === "interface" ? "interface" : Number(event.target.value) as 1 | 2 })}><option value="interface">Interfaz</option><option value="1">AR / RA</option><option value="2">DEC</option></select></label>
                    {step.kind === "motion" ? <>
                      <label title={interfaceHelp} className="grid cursor-help gap-1 text-[9px] uppercase tracking-wider text-dim">Sentido<select className={field} value={step.direction} onChange={(event) => patchStep(step.id, { direction: event.target.value as "cw" | "ccw" | "interface" })}><option value="interface">Interfaz</option><option value="cw">CW</option><option value="ccw">CCW</option></select></label>
                      <label title={interfaceHelp} className="grid cursor-help gap-1 text-[9px] uppercase tracking-wider text-dim">Velocidad °/s<div className="flex gap-1"><select aria-label="Origen de velocidad" className={`${field} w-24`} value={step.speedDegS === "interface" ? "interface" : "fixed"} onChange={(event) => patchStep(step.id, { speedDegS: event.target.value === "interface" ? "interface" : 1 })}><option value="interface">Interfaz</option><option value="fixed">Fija</option></select>{step.speedDegS !== "interface" && <input aria-label="Velocidad fija" className={`${field} min-w-0 flex-1`} type="number" min="0.01" max="5" step="0.01" value={step.speedDegS} onChange={(event) => patchStep(step.id, { speedDegS: Number(event.target.value) })} />}</div></label>
                      <label title={interfaceHelp} className="grid cursor-help gap-1 text-[9px] uppercase tracking-wider text-dim">Revoluciones<div className="flex gap-1"><select aria-label="Origen de revoluciones" className={`${field} w-24`} value={step.revolutions === "interface" ? "interface" : "fixed"} onChange={(event) => patchStep(step.id, { revolutions: event.target.value === "interface" ? "interface" : 1 })}><option value="interface">Interfaz</option><option value="fixed">Fijas</option></select>{step.revolutions !== "interface" && <input aria-label="Revoluciones fijas" className={`${field} min-w-0 flex-1`} type="number" min="1" max="10" step="1" value={step.revolutions} onChange={(event) => patchStep(step.id, { revolutions: Number(event.target.value) })} />}</div></label>
                    </> : <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim lg:col-span-3">Duración s<input className={field} type="number" min="1" max="3600" step="1" value={step.durationSec} onChange={(event) => patchStep(step.id, { durationSec: Number(event.target.value) })} /></label>}
                    <label title={interfaceHelp} className="grid cursor-help gap-1 text-[9px] uppercase tracking-wider text-dim">ADC Hz<div className="flex gap-1"><select aria-label="Origen de muestreo ADC" className={`${field} w-24`} value={step.sampleRateHz === "interface" ? "interface" : "fixed"} onChange={(event) => patchStep(step.id, { sampleRateHz: event.target.value === "interface" ? "interface" : 500 })}><option value="interface">Interfaz</option><option value="fixed">Fijo</option></select>{step.sampleRateHz !== "interface" && <input aria-label="Muestreo ADC fijo" className={`${field} min-w-0 flex-1`} type="number" min="10" max="1000" step="1" value={step.sampleRateHz} onChange={(event) => patchStep(step.id, { sampleRateHz: Number(event.target.value) })} />}</div></label>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={button} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: newExtendedStepId(), kind: "motion", name: "Movimiento", axis: 1, direction: "cw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 }] })}>+ MOVIMIENTO</button>
              <button className={button} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: newExtendedStepId(), kind: "stationary", name: "Medición de ruido", axis: 1, sampleRateHz: 500, durationSec: 20 }] })}>+ MEDICIÓN DE RUIDO</button>
              <span className="ml-auto self-center font-mono text-[9px] uppercase tracking-[0.12em] text-mint">● autoguardado</span>
            </div>
          </main>
        </div>
      </section>
      {profileMenu && <>
        <button type="button" aria-label="Cerrar menú contextual" className="fixed inset-0 z-[81] cursor-default" onClick={() => setProfileMenu(null)} />
        <div role="menu" className="fixed z-[82] w-44 rounded border border-ember/50 bg-[#0b1729] p-1 shadow-2xl" style={{ left: profileMenu.x, top: profileMenu.y }}>
          <button role="menuitem" className="w-full rounded px-2 py-2 text-left font-display text-[9px] font-bold uppercase tracking-[0.12em] text-fog hover:bg-ember/15 hover:text-ember" onClick={() => duplicate(profileMenu.id)}>DUPLICAR PERFIL</button>
        </div>
      </>}
    </div>
  );
}
