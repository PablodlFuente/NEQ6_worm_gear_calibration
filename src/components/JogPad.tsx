import { useRef } from "react";
import { IconArrowUp, IconCrosshair, IconStop } from "./icons";

interface Props {
  disabled: boolean;
  activeAxis: 0 | 1 | 2;
  speedLabel: string;
  onStart: (axis: 1 | 2, dir: 1 | -1) => void;
  onStop: () => void;
}

function HoldBtn({
  label,
  active,
  disabled,
  onStart,
  onStop,
  children,
}: {
  label: string;
  active: boolean;
  disabled: boolean;
  onStart: () => void;
  onStop: () => void;
  children: React.ReactNode;
}) {
  const holding = useRef(false);

  const begin = (e: React.PointerEvent) => {
    if (disabled || holding.current) return;
    holding.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    onStart();
  };
  const end = () => {
    if (!holding.current) return;
    holding.current = false;
    onStop();
  };

  return (
    <button
      aria-label={label}
      title={`${label} (mantener pulsado)`}
      onPointerDown={begin}
      onPointerUp={end}
      onPointerCancel={end}
      onLostPointerCapture={end}
      onContextMenu={(e) => e.preventDefault()}
      className={`flex h-14 items-center justify-center rounded-md border transition-all select-none ${
        active
          ? "border-ember bg-ember/20 text-ember shadow-[0_0_16px_rgba(245,165,36,0.35)]"
          : "border-line bg-[#0c1930] text-dim hover:border-ember/50 hover:text-fog active:scale-95"
      } disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:border-line disabled:hover:text-dim`}
    >
      {children}
    </button>
  );
}

export default function JogPad({ disabled, activeAxis, speedLabel, onStart, onStop }: Props) {
  return (
    <section
      className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{ animationDelay: "120ms" }}
    >
      <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">
        <span className="h-[7px] w-[7px] shrink-0 bg-ember/80" />
        <IconCrosshair className="h-3.5 w-3.5 text-ember/70" />
        Jog manual
        <span className="ml-auto font-mono text-[9.5px] normal-case tracking-normal text-dim">
          ≈ <span className="text-ember">{speedLabel}</span> °/s
        </span>
      </h2>

      <p className="mt-1.5 font-mono text-[10px] leading-relaxed text-dim">
        Mantén pulsada una flecha para mover a la velocidad configurada; al soltar se envía{" "}
        <span className="text-[#ffc46b]">:K</span> (parada suave). Asegúrate de que la zona de giro está libre.
      </p>

      <div className="mt-2.5 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        {/* AR */}
        <div className="flex flex-col items-stretch gap-1.5">
          <p className="text-center font-display text-[9.5px] font-bold tracking-[0.2em] text-[#4d6389]">
            AR <span className={activeAxis === 1 ? "text-ember" : ""}>·1</span>
          </p>
          <HoldBtn
            label="AR horario"
            active={activeAxis === 1}
            disabled={disabled}
            onStart={() => onStart(1, 1)}
            onStop={onStop}
          >
            <IconArrowUp className="h-5 w-5 rotate-90" />
          </HoldBtn>
          <HoldBtn
            label="AR antihorario"
            active={activeAxis === 1}
            disabled={disabled}
            onStart={() => onStart(1, -1)}
            onStop={onStop}
          >
            <IconArrowUp className="h-5 w-5 -rotate-90" />
          </HoldBtn>
        </div>

        {/* centro */}
        <div className="flex flex-col items-center gap-1.5 px-1">
          <IconCrosshair
            className={`h-8 w-8 transition-colors ${activeAxis ? "text-ember" : "text-[#2a3f63]"}`}
          />
          <button
            onClick={onStop}
            disabled={disabled}
            title="Parada suave de ambos ejes (:K1 :K2)"
            className="flex items-center gap-1.5 rounded border border-alert/50 bg-alert/5 px-2.5 py-1.5 font-display text-[9.5px] font-bold tracking-[0.14em] text-alert transition-colors hover:bg-alert/15 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-30"
          >
            <IconStop className="h-3 w-3" /> STOP
          </button>
        </div>

        {/* DEC */}
        <div className="flex flex-col items-stretch gap-1.5">
          <p className="text-center font-display text-[9.5px] font-bold tracking-[0.2em] text-[#4d6389]">
            DEC <span className={activeAxis === 2 ? "text-ember" : ""}>·2</span>
          </p>
          <HoldBtn
            label="DEC norte"
            active={activeAxis === 2}
            disabled={disabled}
            onStart={() => onStart(2, 1)}
            onStop={onStop}
          >
            <IconArrowUp className="h-5 w-5" />
          </HoldBtn>
          <HoldBtn
            label="DEC sur"
            active={activeAxis === 2}
            disabled={disabled}
            onStart={() => onStart(2, -1)}
            onStop={onStop}
          >
            <IconArrowUp className="h-5 w-5 rotate-180" />
          </HoldBtn>
        </div>
      </div>
    </section>
  );
}
