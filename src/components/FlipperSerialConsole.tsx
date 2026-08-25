import { useEffect, useMemo, useRef, useState } from "react";
import type { FlipperApi } from "../hooks/useFlipper";
import { IconSend } from "./icons";

type View = "monitor" | "commands";

export default function FlipperSerialConsole({ flip, view = "commands" }: { flip: FlipperApi; view?: View }) {
  const [command, setCommand] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lines = flip.consoleLines ?? [];
  const decoded = useMemo(() => {
    const line = [...lines].reverse().find((item) => item.direction === "rx")?.text ?? "";
    const info = line.match(/^INFO\s+(\S+)\s+r=(\d+)\s+a=(\d+)\s+c=(\d+)\s+oor=(\d+)\s+ovf=(\d+)\s+n=(\d+)$/);
    if (info) return { title: `INFO · firmware ${info[1]}`, fields: [["RATE solicitada", `${info[2]} Hz`], ["RATE efectiva", `${info[3]} Hz`], ["captura", info[4] === "1" ? "activa" : "parada"], ["OOR / OVF", `${info[5]} / ${info[6]}`], ["muestras", info[7]]] };
    if (line.startsWith("SYNC ")) return { title: "SYNC", fields: [["timestamp Flipper", `${line.slice(5)} µs`]] };
    if (line === "OK") return { title: "OK", fields: [["resultado", "comando aceptado"]] };
    if (line.startsWith("ERR")) return { title: "ERROR", fields: [["respuesta", line]] };
    return { title: line ? "Respuesta ASCII" : "Sin respuesta", fields: line ? [["valor", line]] : [] };
  }, [lines]);
  useEffect(() => {
    if (view === "monitor") endRef.current?.scrollIntoView?.({ block: "end" });
  }, [lines, view]);

  const send = async () => {
    const value = command.trim();
    if (!value || !flip.connected || flip.capturing) return;
    setCommand("");
    await flip.sendConsoleCommand(value);
  };

  if (view === "monitor") return (
    <section className="flex min-h-[420px] flex-col overflow-hidden rounded border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line bg-[#0c1930] px-3 py-2">
        <span className={`led ${flip.connected ? "led-mint led-breathe" : "led-off"}`} />
        <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-fog">Monitor serial · Flipper</h2>
        <span className="ml-auto font-mono text-[9px] text-dim">{flip.transport?.toUpperCase() ?? "DESCONECTADO"}</span>
        <button onClick={flip.clearConsole} className="rounded border border-line px-2 py-0.5 font-mono text-[9px] text-dim hover:text-fog">LIMPIAR</button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2 font-mono text-[9.5px]">
        {!lines.length && <p className="py-10 text-center text-dim">Sin tráfico ASCII del Flipper.</p>}
        {lines.map((line) => (
          <div key={line.id} className="flex gap-2 border-b border-line/30 py-1">
            <span className="shrink-0 text-dim">{new Date(line.time).toLocaleTimeString("es-ES", { hour12: false })}</span>
            <span className={line.direction === "tx" ? "text-ember" : "text-ion"}>{line.direction.toUpperCase()}</span>
            <span className="break-all text-fog">{line.text}</span>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      <div className="flex shrink-0 items-center gap-2 border-t border-line bg-[#0a1424] p-2">
        <span className="select-none pl-1 font-mono text-sm font-semibold text-ember">›</span>
        <input value={command} onChange={(event) => setCommand(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void send()} disabled={!flip.connected || flip.capturing} placeholder={flip.capturing ? "Captura activa…" : "INFO · SYNC · RATE 500 — Enter envía"} className="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-[#e8f0ff] placeholder:text-[#44587c] focus:outline-none disabled:opacity-40" />
        <button onClick={() => void send()} disabled={!flip.connected || flip.capturing || !command.trim()} className="flex shrink-0 items-center gap-1.5 rounded bg-ember px-3.5 py-1.5 font-display text-[11px] font-bold tracking-[0.18em] text-[#1c1204] disabled:opacity-35"><IconSend className="h-3.5 w-3.5" /> ENVIAR</button>
      </div>
    </section>
  );

  return (
    <div className="flex flex-col gap-3">
    <section className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="flex items-center gap-2"><span className="h-[7px] w-[7px] bg-ion/80" /><h2 className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">Decodificador Flipper</h2></header>
      <p className="mt-2 font-mono text-[10px] text-fog">{decoded.title}</p>
      {decoded.fields.length ? <div className="mt-2 grid grid-cols-2 gap-1.5">{decoded.fields.map(([label, value]) => <div key={label} className="rounded border border-line bg-[#0c1930] px-2 py-1.5"><p className="font-mono text-[8.5px] uppercase tracking-wider text-dim">{label}</p><p className="mt-0.5 break-all font-mono text-[10px] text-ion">{value}</p></div>)}</div> : <p className="mt-2 font-mono text-[10px] text-dim">Envía INFO o SYNC desde el monitor izquierdo.</p>}
    </section>
    <section className="rise flex min-h-[260px] flex-col overflow-hidden rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <header className="flex items-center gap-2">
        <span className={`led ${flip.connected ? "led-mint led-breathe" : "led-off"}`} />
        <h2 className="font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">Comandos del Flipper</h2>
        <span className="ml-auto font-mono text-[9px] text-dim">{flip.transport?.toUpperCase() ?? "DESCONECTADO"}</span>
      </header>
      <p className="mt-2 font-mono text-[10px] leading-relaxed text-dim">Canal de control ASCII del registrador. Durante una captura, usa la pestaña Test ejes.</p>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        {["INFO", "SYNC", "START", "STOP", "RATE 500"].map((preset) => (
          <button
            key={preset}
            disabled={!flip.connected || flip.capturing && preset !== "STOP"}
            onClick={() => void flip.sendConsoleCommand(preset)}
            className={`rounded border border-line bg-[#0c1930] px-2 py-[7px] font-mono text-[10px] text-fog transition-colors hover:border-ion/60 hover:bg-[#122240] hover:text-ion disabled:opacity-35 ${preset.startsWith("RATE") ? "col-span-2" : ""}`}
          >
            {preset}
          </button>
        ))}
      </div>
      <div className="mt-3 border-t border-line pt-2.5 font-mono text-[10px] text-dim">RATE &lt;Hz&gt; admite 10–1000. El último tráfico y sus respuestas se ven y se envían desde el monitor izquierdo.</div>
    </section>
    </div>
  );
}
