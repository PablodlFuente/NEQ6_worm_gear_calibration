import { useEffect, useRef, type ReactNode } from "react";
import { hexBytes } from "../lib/serial";
import { IconCrosshair } from "./icons";

export type DisplayMode = "ascii" | "hex" | "mix";

export type EntryKind = "tx" | "rx" | "ok" | "err" | "sys" | "fault";

export interface LogEntry {
  id: number;
  time: string;
  kind: EntryKind;
  text?: string;
  bytes?: Uint8Array;
}

const META: Record<EntryKind, { tag: string; cls: string; mark: string }> = {
  tx: { tag: "TX", cls: "text-ember border-ember/40 bg-ember/10", mark: "›" },
  rx: { tag: "RX", cls: "text-ion border-ion/40 bg-ion/10", mark: "‹" },
  ok: { tag: "OK", cls: "text-mint border-mint/40 bg-mint/10", mark: "‹" },
  err: { tag: "ERR", cls: "text-alert border-alert/40 bg-alert/10", mark: "‹" },
  sys: { tag: "SYS", cls: "text-ion border-ion/40 bg-ion/10", mark: "◆" },
  fault: { tag: "FALLO", cls: "text-alert border-alert/40 bg-alert/10", mark: "✕" },
};

const TEXT_COLOR: Record<EntryKind, string> = {
  tx: "text-[#ffd9a0]",
  rx: "text-[#c9dcf7]",
  ok: "text-[#b8f7cf]",
  err: "text-[#ffb3b3]",
  sys: "text-[#9fc5e8]",
  fault: "text-[#ffb3b3]",
};

function Ascii({ bytes }: { bytes: Uint8Array }) {
  const parts: ReactNode[] = [];
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 32 && b <= 126) parts.push(<span key={i}>{String.fromCharCode(b)}</span>);
    else
      parts.push(
        <span key={i} className="ctl-chip">
          {b.toString(16).toUpperCase().padStart(2, "0")}
        </span>,
      );
  }
  return <>{parts}</>;
}

function EntryRow({ e, mode }: { e: LogEntry; mode: DisplayMode }) {
  const meta = META[e.kind];
  const bytesKind = e.kind === "rx" || e.kind === "ok" || e.kind === "err";

  let body: ReactNode;
  if (bytesKind && e.bytes) {
    const hex = hexBytes(e.bytes);
    if (mode === "hex") body = <span className="text-[#7e93b8]">{hex}</span>;
    else if (mode === "mix")
      body = (
        <span>
          <Ascii bytes={e.bytes} />
          <span className="mt-0.5 block text-[11px] leading-tight text-[#4d6389]">{hex}</span>
        </span>
      );
    else body = <Ascii bytes={e.bytes} />;
  } else {
    body = <span>{e.text}</span>;
  }

  return (
    <div className="log-line group -mx-1 flex items-start gap-2 rounded-sm px-1 hover:bg-white/[0.03]">
      <span className="mt-px shrink-0 select-none text-[10.5px] leading-5 text-[#42567a]">
        {e.time}
      </span>
      <span
        className={`mt-0.5 inline-block w-[46px] shrink-0 select-none rounded-sm border py-px text-center text-[9px] font-semibold leading-4 tracking-wider ${meta.cls}`}
      >
        {meta.tag}
      </span>
      <span className={`min-w-0 flex-1 break-all text-[13px] leading-5 ${TEXT_COLOR[e.kind]}`}>
        <span className="mr-1 opacity-50">{meta.mark}</span>
        {body}
      </span>
      {bytesKind && e.bytes && (
        <span className="mt-px hidden shrink-0 select-none text-[10px] text-[#3c5178] opacity-0 transition-opacity group-hover:opacity-100 sm:block">
          {e.bytes.length} B
        </span>
      )}
    </div>
  );
}

function EmptyState({ ready }: { ready: boolean }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6 text-center">
      <div className="relative">
        <IconCrosshair className="spin-slow h-16 w-16 text-ember/70" />
        <span className="absolute -inset-4 -z-10 rounded-full bg-ember/10 blur-2xl" />
      </div>
      <div>
        <p className="font-display text-sm font-bold tracking-[0.3em] text-fog">
          {ready ? "MONITOR EN ESPERA" : "MONITOR SIN ENLACE"}
        </p>
        <p className="mx-auto mt-2 max-w-sm font-mono text-xs leading-relaxed text-dim">
          {ready
            ? "Abre el puerto COM de tu conversor UART-USB para ver en vivo lo que transmite la NEQ6."
            : "Este navegador no expone la Web Serial API. Usa Chrome o Edge de escritorio, servido por HTTPS o localhost."}
        </p>
      </div>
      <ul className="grid max-w-md gap-2 text-left font-mono text-[11.5px] text-[#7d92b8]">
        <li className="flex gap-2">
          <span className="text-ember">01</span> Pulsa «Conectar» y elige el conversor (CH340, FTDI, CP210x…).
        </li>
        <li className="flex gap-2">
          <span className="text-ember">02</span> La NEQ6 habla a <b className="text-fog">9600 8N1</b>, protocolo MC (EQDIRect).
        </li>
        <li className="flex gap-2">
          <span className="text-ember">03</span> Respuestas: <span className="text-mint">«=» + datos + CR</span> · Errores:{" "}
          <span className="text-alert">«!» + código</span>.
        </li>
      </ul>
    </div>
  );
}

export default function TerminalLog({
  entries,
  mode,
  autoscroll,
  ready,
}: {
  entries: LogEntry[];
  mode: DisplayMode;
  autoscroll: boolean;
  ready: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || !autoscroll) return;
    el.scrollTop = el.scrollHeight;
  }, [entries, autoscroll, mode]);

  return (
    <div ref={ref} className="crt relative min-h-0 flex-1 overflow-y-auto px-3 py-2 font-mono">
      {entries.length === 0 ? (
        <EmptyState ready={ready} />
      ) : (
        <div className="flex flex-col gap-[3px] pb-2">
          {entries.map((e) => (
            <EntryRow key={e.id} e={e} mode={mode} />
          ))}
        </div>
      )}
    </div>
  );
}
