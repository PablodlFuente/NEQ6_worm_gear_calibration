import { forwardRef, useImperativeHandle, useRef } from "react";
import { TERMINATIONS } from "../lib/serial";
import { IconSend } from "./icons";

export interface CommandBarHandle {
  focus: () => void;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  onSend: (cmd: string) => void;
  termination: string;
  onTermination: (id: string) => void;
  history: string[];
}

const CommandBar = forwardRef<CommandBarHandle, Props>(function CommandBar(
  { value, onChange, disabled, onSend, termination, onTermination, history },
  ref,
) {
  const inputRef = useRef<HTMLInputElement>(null);
  const histIdx = useRef(-1);

  useImperativeHandle(ref, () => ({
    focus: () => {
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      });
    },
  }));

  const submit = () => {
    const cmd = value.trim();
    if (!cmd) return;
    onSend(cmd);
    onChange("");
    histIdx.current = -1;
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!history.length) return;
      histIdx.current =
        histIdx.current === -1 ? history.length - 1 : Math.max(0, histIdx.current - 1);
      onChange(history[histIdx.current]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      if (histIdx.current === -1) return;
      histIdx.current += 1;
      if (histIdx.current >= history.length) {
        histIdx.current = -1;
        onChange("");
      } else {
        onChange(history[histIdx.current]);
      }
    }
  };

  return (
    <div className="flex shrink-0 items-center gap-2 border-t border-line bg-[#0a1424] p-2">
      <span className="select-none pl-1 font-mono text-sm font-semibold text-ember">›</span>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        spellCheck={false}
        autoCapitalize="off"
        autoComplete="off"
        placeholder={
          disabled
            ? "Conecta un puerto para enviar comandos…"
            : "Ej. :e1 · :f1 · :j1 · :G100 · :S1001080   — Enter envía, ↑↓ historial"
        }
        className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[#e8f0ff] placeholder:text-[#44587c] focus:outline-none"
      />
      <label className="hidden items-center gap-1.5 sm:flex">
        <span className="text-[10px] uppercase tracking-wider text-dim">fin</span>
        <select
          value={termination}
          onChange={(e) => onTermination(e.target.value)}
          className="rounded border border-line bg-panel px-1.5 py-1 font-mono text-[11px] text-fog focus:border-ember/60 focus:outline-none"
        >
          {TERMINATIONS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={submit}
        disabled={disabled || !value.trim()}
        className="flex shrink-0 items-center gap-1.5 rounded bg-ember px-3.5 py-1.5 font-display text-[11px] font-bold tracking-[0.18em] text-[#1c1204] transition-all hover:bg-[#ffc04d] hover:shadow-[0_0_18px_rgba(245,165,36,0.35)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:shadow-none"
      >
        <IconSend className="h-3.5 w-3.5" />
        ENVIAR
      </button>
    </div>
  );
});

export default CommandBar;
