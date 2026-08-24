import { calculateMotionTiming, MAX_SAFE_ABSOLUTE_GOTO_DELTA, type MountProfile } from "../lib/protocol";
import { IconAlert, IconPlay, IconStop } from "./icons";

export interface MoveInputs {
  axis: 1 | 2 | 3;
  speed: string; /* °/s como texto para permitir "0,5" */
  deg: string;
}

export interface MoveState {
  running: boolean;
  axis: number;
  total: number;
  done: number;
  speed: number;
  real: number;
  t1: number;
  chunks: number;
  chunk: number;
  phase: string;
}

export const IDLE_MOVE: MoveState = {
  running: false,
  axis: 1,
  total: 0,
  done: 0,
  speed: 0,
  real: 0,
  t1: 0,
  chunks: 0,
  chunk: 0,
  phase: "",
};

interface Props {
  open: boolean;
  profile: MountProfile;
  inputs: MoveInputs;
  onInputs: (patch: Partial<MoveInputs>) => void;
  move: MoveState;
  onStart: () => void;
  onStop: (hard: boolean) => void;
  onInitHome: () => void;
}

const num = (s: string) => parseFloat(s.replace(",", "."));
const int = (n: number) => n.toLocaleString("es-ES");

export default function DrivePanel({
  open,
  profile,
  inputs,
  onInputs,
  move,
  onStart,
  onStop,
  onInitHome,
}: Props) {
  const cpr = inputs.axis === 2 ? profile.cpr2 : profile.cpr1;
  const timer = profile.timer;
  const speed = num(inputs.speed);
  const deg = num(inputs.deg);

  const speedOk = isFinite(speed) && speed > 0;
  const degOk = isFinite(deg) && deg !== 0 && Math.abs(deg) <= 720;

  let t1 = 0;
  let real = 0;
  let steps = 0;
  let chunks = 0;
  let secs = 0;
  let maxSpeed = 0;
  let limited = false;
  if (cpr && timer && speedOk) {
    const timing = calculateMotionTiming(timer, cpr, speed);
    t1 = timing.t1;
    real = timing.realDegPerSec;
    maxSpeed = timing.maxDegPerSec;
    limited = timing.limited;
    if (degOk) {
      steps = Math.max(1, Math.round(Math.abs(deg) * (cpr / 360)));
      chunks = Math.max(1, Math.ceil(steps / MAX_SAFE_ABSOLUTE_GOTO_DELTA));
      secs = Math.abs(deg) / real;
    }
  }

  const pct = move.running && move.total > 0 ? Math.min(100, (move.done / move.total) * 100) : 0;
  const canStart = open && !move.running && speedOk && degOk && !!cpr && !!timer;

  const inputCls =
    "w-full rounded border border-line bg-[#0c1930] px-2.5 py-2 font-mono text-[13px] text-[#e8f0ff] transition-colors focus:border-ember/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section
      className="brackets rise relative shrink-0 overflow-hidden rounded-md border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_34px_rgba(0,0,0,0.4)]"
      style={{ animationDelay: "15ms" }}
    >
      {/* cabecera */}
      <div className="flex items-center gap-2 border-b border-line bg-[#0a1424] px-3 py-2">
        <IconPlay className="h-3.5 w-3.5 shrink-0 text-ember" />
        <span className="font-display text-[11px] font-bold tracking-[0.24em] text-fog">
          CONTROL DE GIRO
        </span>
        <span className="hidden font-mono text-[9.5px] text-dim xl:inline">
          :j→:I→:T→:G→:S→:J
        </span>
        <span
          className={`ml-auto rounded border px-2 py-0.5 font-mono text-[9.5px] tracking-[0.14em] transition-colors ${
            move.running
              ? "border-ember/60 bg-ember/10 text-ember"
              : open
                ? "border-mint/40 bg-mint/5 text-mint"
                : "border-line text-dim"
          }`}
        >
          {move.running
            ? `MOVIENDO · TRAMO ${move.chunk}/${move.chunks}`
            : open
              ? "LISTO"
              : "SIN ENLACE"}
        </span>
      </div>

      {/* cuerpo — optimizado para columna estrecha */}
      <div className="grid grid-cols-2 items-end gap-2.5 p-3">
        {/* eje */}
        <div className="col-span-2">
          <p className="mb-1 text-[9.5px] uppercase tracking-[0.14em] text-dim">Eje</p>
          <div className="flex overflow-hidden rounded border border-line">
            {([1, 2, 3] as const).map((a) => (
              <button
                key={a}
                onClick={() => onInputs({ axis: a })}
                disabled={move.running}
                className={`flex-1 px-2 py-2 font-display text-[10.5px] font-bold tracking-[0.12em] transition-colors disabled:cursor-not-allowed ${
                  inputs.axis === a
                    ? "bg-ember/15 text-ember shadow-[inset_0_-2px_0_rgba(245,165,36,0.8)]"
                    : "text-dim hover:bg-white/[0.03] hover:text-fog"
                }`}
              >
                {a === 1 ? "AR·1" : a === 2 ? "DEC·2" : "AMBOS·3"}
              </button>
            ))}
          </div>
        </div>

        {/* velocidad */}
        <div>
          <p className="mb-1 text-[9.5px] uppercase tracking-[0.14em] text-dim">Velocidad °/s</p>
          <input
            type="number"
            min="0.001"
            step="0.1"
            value={inputs.speed}
            disabled={move.running}
            onChange={(e) => onInputs({ speed: e.target.value })}
            className={inputCls}
          />
        </div>

        {/* grados */}
        <div>
          <p className="mb-1 text-[9.5px] uppercase tracking-[0.14em] text-dim">Giro °</p>
          <input
            type="number"
            step="1"
            value={inputs.deg}
            disabled={move.running}
            onChange={(e) => onInputs({ deg: e.target.value })}
            className={inputCls}
          />
        </div>

        {/* cálculos */}
        <p className="col-span-2 -mt-0.5 font-mono text-[9.5px] leading-snug text-dim">
          {!cpr || !timer ? (
            <span className="text-ember/80">Ejecuta «Escanear montura» para conocer CPR y timer.</span>
          ) : !speedOk ? (
            <span className="text-alert">Velocidad no válida (usa &gt; 0, p. ej. 0,5).</span>
          ) : !degOk ? (
            <span className="text-alert">Indica grados ≠ 0 (máx. ±720). Negativo = sentido contrario.</span>
          ) : (
            <>
              solicitada <span className="text-fog">{speed.toFixed(3)}°/s</span> · T1=<span className="text-ion">{int(t1)}</span> · programada{" "}
              <span className={limited ? "text-alert" : "text-mint"}>{real.toFixed(3)}°/s</span>
              {limited ? <span className="text-alert"> (límite {maxSpeed.toFixed(3)}°/s)</span> : null} ·{" "}
              <span className="text-fog">{int(steps)}</span> pasos
              {chunks > 1 ? <span className="text-ember"> · {chunks} tramos</span> : null} · ~
              <span className="text-fog">
                {secs >= 60 ? `${Math.floor(secs / 60)} min ${Math.round(secs % 60)} s` : `${secs.toFixed(0)} s`}
              </span>
            </>
          )}
        </p>

        {/* botones */}
        <div className="col-span-2 flex flex-col gap-1.5">
          <button
            onClick={onStart}
            disabled={!canStart}
            className="flex w-full items-center justify-center gap-2 rounded bg-ember px-4 py-2 font-display text-[11px] font-bold tracking-[0.18em] text-[#1c1204] transition-all hover:bg-[#ffc04d] hover:shadow-[0_0_18px_rgba(245,165,36,0.35)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none"
          >
            {move.running ? (
              <>
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-[#1c1204]/30 border-t-[#1c1204]" />
                GIRANDO
              </>
            ) : (
              <>
                <IconPlay className="h-3.5 w-3.5" /> GIRAR
              </>
            )}
          </button>
          <div className="flex gap-1.5">
            <button
              onClick={() => onStop(false)}
              disabled={!open}
              title="Parada suave :K — el motor desacelera y conserva posición"
              className="flex flex-1 items-center justify-center gap-1.5 rounded border border-alert/50 bg-alert/5 px-3 py-2 font-display text-[10.5px] font-bold tracking-[0.14em] text-alert transition-colors hover:bg-alert/15 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
            >
              <IconStop className="h-3.5 w-3.5" /> STOP
            </button>
            <button
              onClick={() => onStop(true)}
              disabled={!open}
              title="Parada inmediata :L — solo emergencias"
              className="flex items-center justify-center gap-1 rounded bg-alert px-2.5 py-2 font-display text-[10.5px] font-bold tracking-[0.1em] text-[#2b0707] transition-all hover:bg-[#ff7b7b] hover:shadow-[0_0_16px_rgba(255,93,93,0.4)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:shadow-none"
            >
              <IconAlert className="h-3.5 w-3.5" /> ¡YA!
            </button>
            <button
              onClick={onInitHome}
              disabled={!open || move.running}
              title="Marcar la posición actual como home (:F1 :F2) — necesario si :J responde !4"
              className="flex items-center justify-center gap-1.5 rounded border border-ion/50 bg-ion/5 px-3 py-2 font-display text-[10.5px] font-bold tracking-[0.1em] text-ion transition-colors hover:bg-ion/15 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
            >
              HOME
            </button>
          </div>
        </div>
      </div>

      {/* progreso */}
      <div
        className={`grid transition-[grid-template-rows] duration-300 ${
          move.running ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
        }`}
      >
        <div className="overflow-hidden">
          <div className="border-t border-line bg-[#0a1424] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] text-dim">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className="led led-ember led-breathe" />
                <span className="truncate text-ember">{move.phase || "moviendo"}</span>
                <span className="hidden text-[#3c5178] sm:inline">
                  · T1={int(move.t1)} · ≈{move.real.toFixed(3)}°/s
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-fog">
                {move.done.toFixed(1)}° / {move.total.toFixed(1)}°
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-[#122240]">
              <div
                className="h-full rounded-full bg-gradient-to-r from-ember to-[#ffd27a] shadow-[0_0_10px_rgba(245,165,36,0.5)] transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
