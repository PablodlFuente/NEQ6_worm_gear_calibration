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

const freshProfile = (): ExtendedTestProfile => ({
  id: `perfil-${Date.now()}`,
  name: "Nuevo perfil",
  steps: [{ id: newExtendedStepId(), kind: "motion", name: "Movimiento", axis: 1, direction: "cw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 }],
});

export default function ExtendedTestProfilesModal({ open, profiles, selectedId, onProfiles, onSelect, onClose }: Props) {
  const [editingId, setEditingId] = useState(selectedId);
  const [draft, setDraft] = useState<ExtendedTestProfile | null>(null);
  useEffect(() => {
    if (!open) return;
    const profile = profiles.find((item) => item.id === editingId) ?? profiles.find((item) => item.id === selectedId) ?? profiles[0];
    if (profile) {
      setEditingId(profile.id);
      setDraft(cloneExtendedProfile(profile));
    }
  }, [open, editingId, profiles, selectedId]);
  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [open, onClose]);
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
  const save = () => {
    const valid = sanitizeExtendedProfile(draft);
    if (!valid) return;
    const next = profiles.some((profile) => profile.id === valid.id)
      ? profiles.map((profile) => profile.id === valid.id ? cloneExtendedProfile(valid) : profile)
      : [...profiles, cloneExtendedProfile(valid)];
    onProfiles(next);
    onSelect(valid.id);
    setDraft(cloneExtendedProfile(valid));
  };
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
        <div className="grid min-h-0 flex-1 grid-cols-[270px_minmax(0,1fr)]">
          <aside className="min-h-0 overflow-y-auto border-r border-line bg-[#081120] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-[10px] font-bold uppercase tracking-[0.18em] text-dim">Perfiles</span>
              <button onClick={add} className={button}>+ AÑADIR</button>
            </div>
            <div className="grid gap-1.5">
              {profiles.map((profile) => (
                <div key={profile.id} className={`flex items-center rounded border ${editingId === profile.id ? "border-ember/60 bg-ember/10" : "border-line bg-[#0c1930]"}`}>
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
                    <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Acción<select className={field} value={step.kind} onChange={(event) => replaceKind(step, event.target.value as ExtendedTestStep["kind"])}><option value="motion">Mover eje</option><option value="stationary">Medir sin mover</option></select></label>
                    <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Eje<select className={field} value={step.axis} onChange={(event) => patchStep(step.id, { axis: Number(event.target.value) as 1 | 2 })}><option value="1">AR / RA</option><option value="2">DEC</option></select></label>
                    {step.kind === "motion" ? <>
                      <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Sentido<select className={field} value={step.direction} onChange={(event) => patchStep(step.id, { direction: event.target.value as "cw" | "ccw" })}><option value="cw">CW</option><option value="ccw">CCW</option></select></label>
                      <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Velocidad °/s<input className={field} type="number" min="0.01" max="5" step="0.01" value={step.speedDegS} onChange={(event) => patchStep(step.id, { speedDegS: Number(event.target.value) })} /></label>
                      <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">Revoluciones<input className={field} type="number" min="1" max="10" step="1" value={step.revolutions} onChange={(event) => patchStep(step.id, { revolutions: Number(event.target.value) })} /></label>
                    </> : <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim lg:col-span-3">Duración s<input className={field} type="number" min="1" max="3600" step="1" value={step.durationSec} onChange={(event) => patchStep(step.id, { durationSec: Number(event.target.value) })} /></label>}
                    <label className="grid gap-1 text-[9px] uppercase tracking-wider text-dim">ADC Hz<input className={field} type="number" min="10" max="1000" step="1" value={step.sampleRateHz} onChange={(event) => patchStep(step.id, { sampleRateHz: Number(event.target.value) })} /></label>
                  </div>
                </article>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={button} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: newExtendedStepId(), kind: "motion", name: "Movimiento", axis: 1, direction: "cw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 }] })}>+ MOVIMIENTO</button>
              <button className={button} onClick={() => setDraft({ ...draft, steps: [...draft.steps, { id: newExtendedStepId(), kind: "stationary", name: "Medición estacionaria", axis: 1, sampleRateHz: 500, durationSec: 20 }] })}>+ MEDICIÓN SIN MOVIMIENTO</button>
              <button className="ml-auto rounded bg-ember px-4 py-2 font-display text-[10px] font-bold uppercase tracking-[0.16em] text-[#1c1204] disabled:opacity-30" disabled={!draft.name.trim() || !draft.steps.length} onClick={save}>GUARDAR PERFIL</button>
            </div>
          </main>
        </div>
      </section>
    </div>
  );
}
