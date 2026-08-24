import type { FlipperApi } from "../hooks/useFlipper";
import { FLIPPER_COMMANDS } from "../lib/flipper";
import { buildZip, downloadBlob, downloadText } from "../lib/zip";
import { IconAlert, IconBluetooth, IconDownload, IconRadar } from "./icons";

/* fuentes del firmware (Vite las incluye como texto) */
import fwC from "../../flipper_fw/neq6_current_logger/neq6_current_logger.c?raw";
import fwFam from "../../flipper_fw/neq6_current_logger/application.fam?raw";
import fwReadme from "../../flipper_fw/neq6_current_logger/README.md?raw";

export default function FlipperConnection({ flip }: { flip: FlipperApi }) {
  const { ble, usb } = flip;

  const downloadZip = () => {
    const blob = buildZip([
      { name: "neq6_current_logger/neq6_current_logger.c", data: fwC },
      { name: "neq6_current_logger/application.fam", data: fwFam },
      { name: "neq6_current_logger/README.md", data: fwReadme },
    ]);
    downloadBlob("neq6_current_logger.zip", blob);
  };

  return (
    <section
      className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
      style={{ animationDelay: "120ms" }}
    >
      <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">
        <span className="h-[7px] w-[7px] shrink-0 bg-ion/80" />
        Conexión Flipper
        <span
          className={`ml-auto rounded border px-1.5 py-px font-mono text-[9px] tracking-wide ${
            ble.supported || usb.supported
              ? "border-mint/40 bg-mint/5 text-mint"
              : "border-alert/40 bg-alert/5 text-alert"
          }`}
        >
          {ble.supported ? "BLE + COM" : usb.supported ? "SOLO COM" : "NO SOPORTADO"}
        </span>
      </h2>

      <div className="mt-2.5 rounded border border-line bg-[#0c1930] p-2">
        <div className="flex items-center gap-2">
          <span
            className={`led ${
              ble.state === "connected"
                ? "led-mint led-breathe"
                : ble.state === "scanning" || ble.state === "connecting"
                  ? "led-ember led-breathe"
                  : "led-off"
            }`}
          />
          <span className="font-display text-[9.5px] font-bold uppercase tracking-[0.16em] text-dim">BLE</span>
          <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-fog">
            {ble.state === "connected"
              ? ble.deviceName ?? "Flipper"
              : ble.state === "scanning"
                ? "selector abierto…"
                : ble.state === "connecting"
                  ? "conectando GATT…"
                  : "desconectado"}
          </span>
        </div>
        {ble.state === "connected" ? (
          <button
            onClick={ble.disconnect}
            className="mt-2 w-full rounded border border-alert/50 bg-alert/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-alert hover:bg-alert/20"
          >
            DESCONECTAR BLE
          </button>
        ) : (
          <button
            onClick={() => ble.scanAndConnect().catch((e: Error) => ble.setError(e.message))}
            disabled={!ble.supported || ble.state !== "idle" || usb.state !== "idle"}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-ion px-3 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-[#04121c] hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
          >
            <IconBluetooth className="h-3.5 w-3.5" /> ESCANEAR BLE
          </button>
        )}

        <div className="my-2 border-t border-line" />

        <div className="flex items-center gap-2">
          <span className={`led ${usb.state === "connected" ? "led-mint led-breathe" : usb.state === "connecting" ? "led-ember led-breathe" : "led-off"}`} />
          <span className="font-display text-[9.5px] font-bold uppercase tracking-[0.16em] text-dim">USB-COM</span>
          <span className="min-w-0 flex-1 truncate text-right font-mono text-[10px] text-fog">
            {usb.state === "connected" ? usb.deviceName : usb.state === "connecting" ? "abriendo puerto…" : "desconectado"}
          </span>
        </div>
        {usb.state === "connected" ? (
          <button
            onClick={() => void usb.disconnect()}
            className="mt-2 w-full rounded border border-alert/50 bg-alert/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-alert hover:bg-alert/20"
          >
            CERRAR COM DEL FLIPPER
          </button>
        ) : (
          <button
            onClick={() => usb.connect().catch((e: Error) => usb.setError(e.message))}
            disabled={!usb.supported || usb.state !== "idle" || ble.state !== "idle"}
            className="mt-2 w-full rounded border border-ion/60 bg-ion/10 px-3 py-1.5 font-display text-[10px] font-bold tracking-[0.14em] text-ion hover:bg-ion/20 disabled:cursor-not-allowed disabled:opacity-35"
          >
            ELEGIR PUERTO COM DEL FLIPPER
          </button>
        )}
      </div>

      <div className="mt-2.5 flex gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded border border-line px-2.5 py-2">
          <span className={`led ${flip.connected ? "led-mint led-breathe" : "led-off"}`} />
          <span className="truncate font-mono text-[10.5px] text-fog">
            {flip.connected ? `Activo: ${flip.transport?.toUpperCase()}` : "Sin transporte activo"}
          </span>
        </div>
        <button
          onClick={() => void flip.doSync()}
          disabled={!flip.connected || flip.syncing || flip.capturing}
          title="Repetir el handshake de reloj"
          className="flex items-center justify-center gap-1.5 rounded border border-line px-2.5 py-2 font-display text-[10px] font-bold tracking-[0.14em] text-dim transition-colors hover:border-ion/50 hover:text-ion disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconRadar className={`h-3.5 w-3.5 ${flip.syncing ? "animate-spin" : ""}`} />
          SYNC
        </button>
      </div>

      <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-dim">
        Preferente: BLE. Alternativa: ejecuta <span className="text-fog">NEQ6 Current</span> y elige el segundo
        COM que aparece (CDC1); el COM de qFlipper/CLI es CDC0. No abras ambos transportes a la vez.
      </p>

      {flip.sync && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">reloj</p>
            <p className="tabular-nums text-mint">ALINEADO</p>
          </div>
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">jitter</p>
            <p className="tabular-nums text-ion">{flip.sync.jitterMs.toFixed(2)} ms</p>
          </div>
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">RTT ({flip.sync.n})</p>
            <p className="tabular-nums text-ion">{flip.sync.rtt.toFixed(0)} ms</p>
          </div>
        </div>
      )}
      {(ble.error || usb.error) && (
        <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] text-alert">
          <IconAlert className="mt-px h-3 w-3 shrink-0" /> {ble.error ?? usb.error}
        </p>
      )}

      {/* firmware descargable */}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="text-[9.5px] uppercase tracking-[0.14em] text-dim">Firmware (SDK oficial / Momentum)</p>
        <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-dim">
          FAP completa: ADC crudo en PA7 (pin 2) · BLE + USB CDC1 · timestamp DWT
          extendido · ring buffer 2048 · tasa 10–1000 Hz. Descomprime y compila con{" "}
          <span className="text-fog">ufbt</span>.
        </p>
        <button
          onClick={downloadZip}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded bg-ion px-3 py-2 font-display text-[10.5px] font-bold tracking-[0.16em] text-[#04121c] transition-all hover:brightness-110 hover:shadow-[0_0_18px_rgba(76,201,240,0.35)] active:translate-y-px"
        >
          <IconDownload className="h-4 w-4" /> DESCARGAR neq6_current_logger.zip
        </button>
        <div className="mt-1.5 flex gap-1.5">
          <button
            onClick={() => downloadText("neq6_current_logger.c", fwC)}
            className="flex-1 rounded border border-line px-2 py-1 font-mono text-[9.5px] text-dim transition-colors hover:border-ion/50 hover:text-ion"
          >
            neq6_current_logger.c
          </button>
          <button
            onClick={() => downloadText("application.fam", fwFam)}
            className="flex-1 rounded border border-line px-2 py-1 font-mono text-[9.5px] text-dim transition-colors hover:border-ion/50 hover:text-ion"
          >
            application.fam
          </button>
        </div>
        <div className="mt-2 overflow-hidden rounded border border-line">
          <table className="w-full font-mono text-[10px]">
            <tbody>
              {FLIPPER_COMMANDS.map((c) => (
                <tr key={c.cmd} className="border-t border-line/60 first:border-t-0">
                  <td className="whitespace-nowrap px-2 py-1 font-semibold text-[#9adcf5]">{c.cmd}</td>
                  <td className="px-2 py-1 text-dim">{c.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
