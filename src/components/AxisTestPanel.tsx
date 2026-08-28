import type { FlipperApi } from "../hooks/useFlipper";
import { calculateMotionTiming, type MountProfile } from "../lib/protocol";
import { IconAlert, IconPlay, IconStop } from "./icons";
import { estimateExtendedProfileSeconds, type ExtendedTestProfile } from "../lib/extendedTestProfiles";
import { useState } from "react";

export interface AxisTestInputs {
  axis: 1 | 2;
  direction: "cw" | "ccw";
  revolutions: string;
  sampleRate: number;
  speed: string;
}

export interface AxisTestState {
  running: boolean;
  progress: number;
  currentDeg: number;
  targetDeg: number;
  message: string;
  elapsedSec: number;
  actualDurationSec: number | null;
}

export interface ExtendedTestState {
  running: boolean;
  pass: number;
  total: number;
  message: string;
}

interface Props {
  inputs: AxisTestInputs;
  onInputs: (patch: Partial<AxisTestInputs>) => void;
  state: AxisTestState;
  extended: ExtendedTestState;
  mountOpen: boolean;
  mountBusy: boolean;
  flip: FlipperApi;
  profile: MountProfile;
  movePhase: string;
  onStart: () => void;
  onStartExtended: (profileId: string) => void;
  extendedProfiles: ExtendedTestProfile[];
  selectedExtendedProfileId: string;
  onSelectedExtendedProfile: (id: string) => void;
  onStop: () => void;
}

const RATES = [10, 50, 100, 250, 500, 1000];
const inputClass =
  "w-full rounded border border-line bg-[#0c1930] px-2.5 py-2 font-mono text-[12px] text-fog transition-colors focus:border-ember/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";

export default function AxisTestPanel({
  inputs,
  onInputs,
  state,
  extended,
  mountOpen,
  mountBusy,
  flip,
  profile,
  movePhase,
  onStart,
  onStartExtended,
  extendedProfiles,
  selectedExtendedProfileId,
  onSelectedExtendedProfile,
  onStop,
}: Props) {
  const [extendedChooserOpen, setExtendedChooserOpen] = useState(false);
  const revs = Number(inputs.revolutions.replace(",", "."));
  const speed = Number(inputs.speed.replace(",", "."));
  const valuesOk = Number.isInteger(revs) && revs >= 1 && revs <= 10 && speed > 0 && speed <= 5;
  const busy = state.running || extended.running;
  const ready = mountOpen && flip.connected && Boolean(flip.sync) && !flip.syncing && !mountBusy && !extended.running && valuesOk;
  const progress = Math.max(0, Math.min(1, state.progress));
  const cpr = inputs.axis === 1 ? profile.cpr1 : profile.cpr2;
  const ratio = (inputs.axis === 1 ? profile.ratio1 : profile.ratio2) || 16;
  const timing = cpr && profile.timer && speed > 0 ? calculateMotionTiming(profile.timer, cpr, speed, ratio) : null;
  const estimatedSamplesPerDeg = timing ? inputs.sampleRate / timing.realDegPerSec : null;
  const measuredSpeed = flip.derived?.st.feedbackSpeedDegS ?? null;
  const measuredSamplesPerDeg = flip.derived?.st.samplesPerDeg ?? null;
  const effectiveRate = flip.derived?.st.rateEst ?? null;
  const estimatedDurationSec = timing ? state.targetDeg / timing.realDegPerSec : null;
  const selectedExtendedProfile = extendedProfiles.find((item) => item.id === selectedExtendedProfileId) ?? extendedProfiles[0];
  const estimatedExtendedDurationSec = estimateExtendedProfileSeconds(selectedExtendedProfile, {
    axis: inputs.axis,
    direction: inputs.direction,
    speedDegS: speed,
    sampleRateHz: inputs.sampleRate,
    revolutions: revs,
  });
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);
    return mins ? `${mins} min ${secs.toString().padStart(2, "0")} s` : `${secs} s`;
  };

  return (
    <section className="rounded border border-line bg-panel p-3">
      <div className="flex items-center gap-2">
        <span className="h-[7px] w-[7px] bg-ember" />
        <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-fog">
          Parámetros del test
        </h2>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <label className="col-span-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          Eje a girar
          <div className="mt-1 flex overflow-hidden rounded border border-line">
            {([1, 2] as const).map((axis) => (
              <button
                key={axis}
                type="button"
                disabled={busy}
                onClick={() => onInputs({ axis })}
                className={`flex-1 px-2 py-2 font-display text-[10.5px] font-bold tracking-[0.14em] transition-colors disabled:opacity-40 ${
                  inputs.axis === axis ? "bg-ember/15 text-ember" : "bg-[#0c1930] text-dim hover:text-fog"
                }`}
              >
                {axis === 1 ? "AR / RA" : "DEC"}
              </button>
            ))}
          </div>
        </label>

        <label className="col-span-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          Sentido de medida
          <div className="mt-1 flex overflow-hidden rounded border border-line">
            {(["cw", "ccw"] as const).map((direction) => (
              <button
                key={direction}
                type="button"
                disabled={busy}
                onClick={() => onInputs({ direction })}
                className={`flex-1 px-2 py-2 font-display text-[10.5px] font-bold tracking-[0.12em] transition-colors disabled:opacity-40 ${
                  inputs.direction === direction
                    ? "bg-ember/15 text-ember shadow-[inset_0_-2px_0_rgba(245,165,36,0.8)]"
                    : "bg-[#0c1930] text-dim hover:bg-white/[0.03] hover:text-fog"
                }`}
              >
                {direction === "cw" ? "CW · horario" : "CCW · antihorario"}
              </button>
            ))}
          </div>
        </label>

        <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          Nº revoluciones
          <input
            className={`${inputClass} mt-1`}
            type="number"
            min="1"
            max="10"
            step="1"
            value={inputs.revolutions}
            disabled={busy}
            onChange={(event) => onInputs({ revolutions: event.target.value })}
          />
        </label>

        <label className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          Muestreo ADC
          <select
            className={`${inputClass} mt-1`}
            value={inputs.sampleRate}
            disabled={busy}
            onChange={(event) => onInputs({ sampleRate: Number(event.target.value) })}
          >
            {RATES.map((rate) => (
              <option key={rate} value={rate}>
                {rate} Hz
              </option>
            ))}
          </select>
        </label>

        <label className="col-span-2 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">
          Velocidad del eje
          <div className="relative mt-1">
            <input
              className={`${inputClass} pr-12`}
              type="number"
              min="0.01"
              max="5"
              step="0.01"
              value={inputs.speed}
              disabled={busy}
              onChange={(event) => onInputs({ speed: event.target.value })}
            />
            <span className="pointer-events-none absolute right-2.5 top-2 font-mono text-[10px] text-dim">°/s</span>
          </div>
        </label>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5 rounded border border-line bg-[#081120] p-2.5 font-mono text-[9.5px]">
        <span className="text-dim">vel. programada</span>
        <span className={`text-right tabular-nums ${timing?.limited ? "text-alert" : "text-mint"}`}>
          {timing ? `${timing.realDegPerSec.toFixed(4)} °/s · ${timing.highSpeed ? "rápida" : "lenta"}` : "—"}
        </span>
        <span className="text-dim">vel. medida (:j)</span>
        <span className="text-right tabular-nums text-ion">{measuredSpeed ? `${measuredSpeed.toFixed(4)} °/s` : "—"}</span>
        <span className="text-dim">muestras/° estimadas</span>
        <span className="text-right tabular-nums text-fog">{estimatedSamplesPerDeg ? estimatedSamplesPerDeg.toFixed(1) : "—"}</span>
        <span className="text-dim">muestras/° medidas</span>
        <span className="text-right tabular-nums text-ion">{measuredSamplesPerDeg ? measuredSamplesPerDeg.toFixed(1) : "—"}</span>
        <span className="text-dim">ADC efectivo</span>
        <span className={`text-right tabular-nums ${effectiveRate && effectiveRate < inputs.sampleRate * 0.9 ? "text-alert" : "text-ion"}`}>
          {effectiveRate ? `${effectiveRate.toFixed(1)} Hz` : "—"}
        </span>
        <span className="text-dim">tiempo estimado</span>
        <span className="text-right tabular-nums text-fog">{estimatedDurationSec ? formatTime(estimatedDurationSec) : "—"}</span>
        <span className="text-dim">tiempo extendido ≈</span>
        <span className="text-right tabular-nums text-fog">{estimatedExtendedDurationSec ? formatTime(estimatedExtendedDurationSec) : "—"}</span>
        <span className="text-dim">tiempo {state.running ? "transcurrido" : "real"}</span>
        <span className="text-right tabular-nums text-ion">
          {state.running
            ? formatTime(state.elapsedSec)
            : state.actualDurationSec !== null
              ? formatTime(state.actualDurationSec)
              : "—"}
        </span>
        {timing?.limited && (
          <p className="col-span-2 mt-1 text-alert">Límite nominal NEQ6: {timing.maxDegPerSec.toFixed(4)} °/s (800× sideral).</p>
        )}
      </div>

      <div className="mt-3 rounded border border-line bg-[#081120] p-2.5 font-mono text-[9.5px]">
        <div className="flex justify-between text-dim">
          <span>recorrido</span>
          <span className="tabular-nums text-fog">
            {state.currentDeg.toFixed(1)}° / {state.targetDeg.toFixed(0)}°
          </span>
        </div>
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#172744]">
          <div
            className="h-full bg-ember transition-[width] duration-200"
            style={{ width: `${progress * 100}%` }}
          />
        </div>
        <p className="mt-2 min-h-4 text-dim">{extended.running ? extended.message : state.running ? movePhase || state.message : state.message}</p>
      </div>

      {state.running || extended.running ? (
        <button
          onClick={onStop}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded bg-alert px-3 py-2.5 font-display text-[11px] font-bold tracking-[0.18em] text-[#2b0707] transition-all hover:bg-[#ff7b7b] hover:shadow-[0_0_16px_rgba(255,93,93,0.4)]"
        >
          <IconStop className="h-4 w-4" /> {extended.running ? `DETENER TEST EXTENDIDO · ${extended.pass}/${extended.total}` : "PARADA DE EMERGENCIA"}
        </button>
      ) : (
        <div className="mt-3 grid gap-2">
          <button
            onClick={onStart}
            disabled={!ready}
            className="flex w-full items-center justify-center gap-2 rounded bg-ember px-3 py-2.5 font-display text-[11px] font-bold tracking-[0.18em] text-[#1c1204] transition-all hover:bg-[#ffc04d] hover:shadow-[0_0_18px_rgba(245,165,36,0.35)] disabled:cursor-not-allowed disabled:opacity-35"
          >
            <IconPlay className="h-4 w-4" /> INICIAR TEST BÁSICO
          </button>
          <button
            onClick={() => setExtendedChooserOpen((value) => !value)}
            disabled={!ready}
            title="Seleccionar un perfil de secuencia para ejecutar"
            className="flex w-full items-center justify-center gap-2 rounded border border-ion/60 bg-ion/10 px-3 py-2.5 font-display text-[11px] font-bold tracking-[0.18em] text-ion transition-all hover:bg-ion/20 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <IconPlay className="h-4 w-4" /> INICIAR TEST EXTENDIDO
          </button>
          {extendedChooserOpen && (
            <div className="rounded border border-ion/40 bg-[#081120] p-2">
              <label className="font-mono text-[9px] uppercase tracking-[0.12em] text-dim">
                Perfil de ejecución
                <select
                  className={`${inputClass} mt-1`}
                  value={selectedExtendedProfile?.id ?? ""}
                  onChange={(event) => onSelectedExtendedProfile(event.target.value)}
                >
                  {extendedProfiles.map((profileItem) => <option key={profileItem.id} value={profileItem.id}>{profileItem.name}</option>)}
                </select>
              </label>
              <div className="mt-2 flex items-center justify-between gap-2 font-mono text-[9.5px] text-dim">
                <span>{selectedExtendedProfile?.steps.length ?? 0} pasos · ≈ {estimatedExtendedDurationSec ? formatTime(estimatedExtendedDurationSec) : "—"}</span>
                <button
                  disabled={!ready || !selectedExtendedProfile}
                  onClick={() => {
                    if (!selectedExtendedProfile) return;
                    setExtendedChooserOpen(false);
                    onStartExtended(selectedExtendedProfile.id);
                  }}
                  className="rounded bg-ion px-3 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.13em] text-[#04131a] disabled:opacity-30"
                >
                  EJECUTAR PERFIL
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!ready && !state.running && (
        <div className="mt-2 flex items-start gap-1.5 font-mono text-[9.5px] text-dim">
          <IconAlert className="mt-px h-3 w-3 shrink-0 text-ember" />
          <span>
            {!mountOpen
              ? "Conecta la montura."
              : !flip.connected
                ? "Conecta el Flipper por BLE o USB-COM en Ajustes."
                : flip.syncing
                  ? "Espera a que termine la sincronización del reloj."
                  : !flip.sync
                    ? "Sincroniza el reloj del Flipper desde Ajustes."
                  : mountBusy
                  ? "Espera a que termine el movimiento actual."
                  : "Revoluciones: entero 1-10. Velocidad: 0,01-5 °/s."}
          </span>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-1.5 font-mono text-[9px] uppercase tracking-wider text-dim">
        <span className={mountOpen ? "text-mint" : "text-alert"}>Montura {mountOpen ? "OK" : "OFF"}</span>
        <span className={flip.connected ? "text-mint" : "text-alert"}>
          ADC {flip.transport ? flip.transport.toUpperCase() : "OFF"}
        </span>
      </div>
    </section>
  );
}
