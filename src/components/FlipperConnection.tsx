import { useRef } from "react";
import type { FlipperApi } from "../hooks/useFlipper";
import { FLIPPER_COMMANDS } from "../lib/flipper";
import { buildZip, downloadBlob, downloadText } from "../lib/zip";
import { IconAlert, IconBluetooth, IconDownload, IconRadar } from "./icons";

/* fuentes del firmware (Vite las incluye como texto) */
import fwC from "../firmware/neq6_flipper_logger.c?raw";
import fwFam from "../firmware/application.fam?raw";
import fwReadme from "../firmware/README.md?raw";

const RATES = [10, 50, 100, 250, 500, 1000];

export default function FlipperConnection({ flip }: { flip: FlipperApi }) {
  const { ble } = flip;
  const fileRef = useRef<HTMLInputElement>(null);

  const downloadZip = () => {
    const blob = buildZip([
      { name: "neq6_current_logger/neq6_flipper_logger.c", data: fwC },
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
            ble.supported ? "border-mint/40 bg-mint/5 text-mint" : "border-alert/40 bg-alert/5 text-alert"
          }`}
        >
          {ble.supported ? "WEB BT OK" : "NO SOPORTADO"}
        </span>
      </h2>

      <div className="mt-2.5 flex items-center gap-2.5">
        <span
          className={`led ${
            ble.state === "connected"
              ? "led-mint led-breathe"
              : ble.state === "scanning" || ble.state === "connecting"
                ? "led-ember led-breathe"
                : "led-off"
          }`}
        />
        <span className="truncate font-mono text-[11.5px] text-fog">
          {ble.state === "connected"
            ? ble.deviceName ?? "Flipper"
            : ble.state === "scanning"
              ? "Selector de dispositivos abierto…"
              : ble.state === "connecting"
                ? "Emparejando / conectando GATT…"
                : "Sin enlace BLE"}
        </span>
      </div>

      <div className="mt-2.5 flex gap-2">
        {ble.state === "connected" ? (
          <button
            onClick={ble.disconnect}
            className="flex flex-1 items-center justify-center gap-2 rounded border border-alert/50 bg-alert/10 px-3 py-2 font-display text-[10.5px] font-bold tracking-[0.16em] text-alert transition-colors hover:bg-alert/20"
          >
            DESCONECTAR
          </button>
        ) : (
          <button
            onClick={() => ble.scanAndConnect().catch((e: Error) => ble.setError(e.message))}
            disabled={!ble.supported || ble.state !== "idle"}
            className="flex flex-1 items-center justify-center gap-2 rounded bg-ion px-3 py-2 font-display text-[10.5px] font-bold tracking-[0.16em] text-[#04121c] transition-all hover:brightness-110 hover:shadow-[0_0_18px_rgba(76,201,240,0.35)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35"
          >
            <IconBluetooth className="h-4 w-4" />
            {ble.state === "idle" ? "ESCANEAR Y EMPAREJAR" : "CONECTANDO…"}
          </button>
        )}
        <button
          onClick={() => void flip.doSync()}
          disabled={ble.state !== "connected" || flip.syncing}
          title="Repetir el handshake de reloj (offset + drift)"
          className="flex items-center justify-center gap-1.5 rounded border border-line px-2.5 py-2 font-display text-[10px] font-bold tracking-[0.14em] text-dim transition-colors hover:border-ion/50 hover:text-ion disabled:cursor-not-allowed disabled:opacity-35"
        >
          <IconRadar className={`h-3.5 w-3.5 ${flip.syncing ? "animate-spin" : ""}`} />
          SYNC
        </button>
      </div>

      <p className="mt-2 font-mono text-[9.5px] leading-relaxed text-dim">
        Usa la app <span className="text-fog">NEQ6 Current</span> (o «Bluetooth Serial» de serie) en el
        Flipper. Si pide código de emparejamiento, el PIN aparece en la pantalla del Flipper: introdúcelo
        en el diálogo del sistema.
      </p>

      {flip.sync && (
        <div className="mt-2 grid grid-cols-3 gap-1.5 font-mono text-[10px]">
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">offset</p>
            <p className="tabular-nums text-ion">{flip.sync.offsetMs.toFixed(1)} ms</p>
          </div>
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">drift</p>
            <p className="tabular-nums text-ion">{flip.sync.driftPpm.toFixed(1)} ppm</p>
          </div>
          <div className="rounded border border-line bg-[#0c1930] px-2 py-1.5">
            <p className="text-[8.5px] uppercase tracking-wider text-dim">RTT ({flip.sync.n})</p>
            <p className="tabular-nums text-ion">{flip.sync.rtt.toFixed(0)} ms</p>
          </div>
        </div>
      )}
      {ble.error && (
        <p className="mt-2 flex items-start gap-1.5 font-mono text-[10px] text-alert">
          <IconAlert className="mt-px h-3 w-3 shrink-0" /> {ble.error}
        </p>
      )}

      {/* firmware descargable */}
      <div className="mt-3 border-t border-line pt-2.5">
        <p className="text-[9.5px] uppercase tracking-[0.14em] text-dim">Firmware (SDK Momentum actual)</p>
        <p className="mt-1.5 font-mono text-[9.5px] leading-relaxed text-dim">
          FAP completa: PA7 (pin 2) · shunt 0.323 Ω · K=1.0025189 · BLE serie · timestamps DWT µs ·
          ring buffer 2048 · tasa 10–1000 Hz. Descomprime y compila con{" "}
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
            onClick={() => downloadText("neq6_flipper_logger.c", fwC)}
            className="flex-1 rounded border border-line px-2 py-1 font-mono text-[9.5px] text-dim transition-colors hover:border-ion/50 hover:text-ion"
          >
            neq6_flipper_logger.c
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
      <input ref={fileRef} type="file" className="hidden" readOnly />
    </section>
  );
}
