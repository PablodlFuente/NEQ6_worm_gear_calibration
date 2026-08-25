import { useEffect, useRef, useState } from "react";
import type { FlipperApi } from "../hooks/useFlipper";

type View = "monitor" | "commands";

export default function FlipperSerialConsole({ flip, view = "commands" }: { flip: FlipperApi; view?: View }) {
  const [command, setCommand] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const lines = flip.consoleLines ?? [];
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
    </section>
  );

  return (
    <section className="flex min-h-[260px] flex-col overflow-hidden rounded border border-line bg-panel">
      <header className="flex items-center gap-2 border-b border-line bg-[#0c1930] px-3 py-2">
        <span className={`led ${flip.connected ? "led-mint led-breathe" : "led-off"}`} />
        <h2 className="font-display text-[10px] font-bold uppercase tracking-[0.16em] text-fog">Comandos del Flipper</h2>
        <span className="ml-auto font-mono text-[9px] text-dim">{flip.transport?.toUpperCase() ?? "DESCONECTADO"}</span>
      </header>
      <div className="grid grid-cols-2 gap-1.5 p-2">
        {["INFO", "SYNC", "START", "STOP"].map((preset) => (
          <button
            key={preset}
            disabled={!flip.connected || flip.capturing && preset !== "STOP"}
            onClick={() => void flip.sendConsoleCommand(preset)}
            className="rounded border border-line bg-[#0c1930] px-2 py-2 font-mono text-[10px] text-fog hover:border-ion/60 hover:text-ion disabled:opacity-35"
          >
            {preset}
          </button>
        ))}
      </div>
      <p className="border-t border-line px-2 py-1.5 font-mono text-[9px] text-dim">RATE &lt;Hz&gt; admite 10–1000. Durante un test, usa la pestaña Test ejes.</p>
      <div className="flex gap-1.5 border-t border-line bg-[#091426] p-2">
        <input
          value={command}
          onChange={(event) => setCommand(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && void send()}
          disabled={!flip.connected || flip.capturing}
          placeholder={flip.capturing ? "Captura activa…" : "INFO, SYNC, RATE 500…"}
          className="min-w-0 flex-1 rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[10.5px] text-fog focus:border-ion/60 focus:outline-none disabled:opacity-40"
        />
        <button onClick={() => void send()} disabled={!flip.connected || flip.capturing || !command.trim()} className="rounded bg-ion px-3 font-display text-[9.5px] font-bold text-[#04121c] disabled:opacity-35">ENVIAR</button>
      </div>
    </section>
  );
}
