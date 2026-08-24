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
      className={`flex aspect-square w-full items-center justify-center rounded-md border transition-all select-none ${
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

      <div className="mx-auto mt-2.5 grid w-full max-w-[270px] grid-cols-3 grid-rows-3 gap-1.5">
        <div className="col-start-2 row-start-1">
          <HoldBtn label="DEC norte" active={activeAxis === 2} disabled={disabled} onStart={() => onStart(2, 1)} onStop={onStop}>
            <span className="flex flex-col items-center gap-1"><IconArrowUp className="h-5 w-5" /><small className="font-display text-[8px] tracking-wider">DEC+</small></span>
          </HoldBtn>
        </div>
        <div className="col-start-1 row-start-2">
          <HoldBtn label="AR antihorario" active={activeAxis === 1} disabled={disabled} onStart={() => onStart(1, -1)} onStop={onStop}>
            <span className="flex flex-col items-center gap-1"><IconArrowUp className="h-5 w-5 -rotate-90" /><small className="font-display text-[8px] tracking-wider">AR−</small></span>
          </HoldBtn>
        </div>
        <button
          onClick={onStop}
          disabled={disabled}
          title="Parada suave del eje activo"
          className="col-start-2 row-start-2 flex aspect-square w-full flex-col items-center justify-center gap-1 rounded-md border border-line bg-[#0c1930] font-display text-[9px] font-bold tracking-[0.12em] text-alert transition-all hover:border-alert/50 hover:bg-alert/10 active:scale-95 disabled:opacity-30"
        >
          <IconStop className="h-4 w-4" /> STOP
        </button>
        <div className="col-start-3 row-start-2">
          <HoldBtn label="AR horario" active={activeAxis === 1} disabled={disabled} onStart={() => onStart(1, 1)} onStop={onStop}>
            <span className="flex flex-col items-center gap-1"><IconArrowUp className="h-5 w-5 rotate-90" /><small className="font-display text-[8px] tracking-wider">AR+</small></span>
          </HoldBtn>
        </div>
        <div className="col-start-2 row-start-3">
          <HoldBtn label="DEC sur" active={activeAxis === 2} disabled={disabled} onStart={() => onStart(2, -1)} onStop={onStop}>
            <span className="flex flex-col items-center gap-1"><IconArrowUp className="h-5 w-5 rotate-180" /><small className="font-display text-[8px] tracking-wider">DEC−</small></span>
          </HoldBtn>
        </div>
      </div>
    </section>
  );
}
