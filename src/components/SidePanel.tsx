import type { ReactNode } from "react";
import { BAUD_RATES, portLabel } from "../lib/serial";
import { DIAG_SEQUENCE, QUICK, type MountProfile, type QuickCmd } from "../lib/protocol";
import type { SerialSettings, SerialStatus } from "../hooks/useSerial";
import type { FlipperApi } from "../hooks/useFlipper";
import type { DecodedState } from "./DecoderPanel";
import DecoderPanel from "./DecoderPanel";
import FlipperConnection from "./FlipperConnection";
import { IconBook, IconPlug, IconRadar, IconStop, IconUnplug } from "./icons";

export interface AutoState {
  running: boolean;
  step: number;
  total: number;
  cmd: string;
}

interface Props {
  mode: "ajustes" | "montura";
  flip: FlipperApi;
  supported: boolean;
  status: SerialStatus;
  settings: SerialSettings;
  onSettings: (s: SerialSettings) => void;
  portInfo?: SerialPortInfo;
  authorized: SerialPort[];
  onOpenAuthorized: (p: SerialPort) => void;
  onConnect: () => void;
  onDisconnect: () => void;
  onQuick: (item: QuickCmd) => void;
  decoded: DecodedState | null;
  profile: MountProfile;
  auto: AutoState;
  onRunDiag: () => void;
  onCancelDiag: () => void;
}

const selCls =
  "w-full rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[11.5px] text-fog transition-colors focus:border-ember/60 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40";

function Head({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 font-display text-[11px] font-bold uppercase tracking-[0.24em] text-dim">
      <span className="h-[7px] w-[7px] shrink-0 bg-ember/80" />
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[9.5px] uppercase tracking-[0.14em] text-dim">{label}</span>
      {children}
    </label>
  );
}

export default function SidePanel({
  mode,
  flip,
  supported,
  status,
  settings,
  onSettings,
  portInfo,
  authorized,
  onOpenAuthorized,
  onConnect,
  onDisconnect,
  onQuick,
  decoded,
  profile,
  auto,
  onRunDiag,
  onCancelDiag,
}: Props) {
  const open = status === "open";
  const locked = status !== "closed";
  const ajustes = mode === "ajustes";

  return (
    <aside className="flex min-h-0 flex-col gap-3 lg:overflow-y-auto lg:pr-0.5">
      {/* ── CONEXIÓN MONTURA (ajustes) ─────────────────────── */}
      {ajustes && (
        <section
          className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animationDelay: "60ms" }}
        >
          <Head>Conexión montura</Head>

          <div className="mt-3 flex items-center gap-2.5">
            <span
              className={`led ${
                open ? "led-mint led-breathe" : status === "connecting" ? "led-ember led-breathe" : "led-off"
              }`}
            />
            <span className="truncate font-mono text-[11.5px] text-fog">
              {open ? portLabel(portInfo) : status === "connecting" ? "Negociando el puerto…" : "Sin puerto abierto"}
            </span>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <Field label="Baudios">
              <select
                value={settings.baudRate}
                disabled={locked}
                onChange={(e) => onSettings({ ...settings, baudRate: Number(e.target.value) })}
                className={selCls}
              >
                {BAUD_RATES.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Bits de datos">
              <select
                value={settings.dataBits}
                disabled={locked}
                onChange={(e) => onSettings({ ...settings, dataBits: Number(e.target.value) as 7 | 8 })}
                className={selCls}
              >
                <option value={8}>8</option>
                <option value={7}>7</option>
              </select>
            </Field>
            <Field label="Paridad">
              <select
                value={settings.parity}
                disabled={locked}
                onChange={(e) => onSettings({ ...settings, parity: e.target.value as SerialSettings["parity"] })}
                className={selCls}
              >
                <option value="none">Ninguna</option>
                <option value="even">Par</option>
                <option value="odd">Impar</option>
              </select>
            </Field>
            <Field label="Bits de parada">
              <select
                value={settings.stopBits}
                disabled={locked}
                onChange={(e) => onSettings({ ...settings, stopBits: Number(e.target.value) as 1 | 2 })}
                className={selCls}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
              </select>
            </Field>
          </div>

          <button
            onClick={open ? onDisconnect : onConnect}
            disabled={!supported || status === "connecting"}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded px-3 py-2 font-display text-[11px] font-bold tracking-[0.18em] transition-all active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35 ${
              open
                ? "border border-alert/50 bg-alert/10 text-alert hover:bg-alert/20"
                : "bg-ember text-[#1c1204] hover:bg-[#ffc04d] hover:shadow-[0_0_18px_rgba(245,165,36,0.35)]"
            }`}
          >
            {open ? (
              <>
                <IconUnplug className="h-4 w-4" /> CERRAR PUERTO
              </>
            ) : status === "connecting" ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#1c1204]/30 border-t-[#1c1204]" />
                ABRIENDO…
              </>
            ) : (
              <>
                <IconPlug className="h-4 w-4" /> SOLICITAR PUERTO
              </>
            )}
          </button>

          {authorized.length > 0 && !open && (
            <div className="mt-3 border-t border-line pt-2.5">
              <p className="text-[9.5px] uppercase tracking-[0.14em] text-dim">Puertos COM ya autorizados</p>
              <div className="mt-1.5 flex flex-col gap-1">
                {authorized.map((p, i) => {
                  const info = p.getInfo();
                  return (
                    <button
                      key={i}
                      onClick={() => onOpenAuthorized(p)}
                      disabled={status === "connecting"}
                      className="group flex items-center justify-between gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5 text-left transition-colors hover:border-ember/50 hover:bg-[#122240] disabled:opacity-40"
                    >
                      <span className="truncate font-mono text-[11px] text-fog">{portLabel(info)}</span>
                      <span className="shrink-0 font-display text-[9.5px] tracking-[0.14em] text-ember opacity-0 transition-opacity group-hover:opacity-100">
                        ABRIR →
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      )}

      {/* ── MONTURA DETECTADA (ajustes) ────────────────────── */}
      {ajustes && (
        <section
          className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animationDelay: "90ms" }}
        >
          <Head>Montura detectada</Head>
          {!profile.cpr1 && !profile.timer && !profile.fw ? (
            <p className="mt-2 font-mono text-[10.5px] leading-relaxed text-dim">
              Aún sin datos. Lanza «Escanear montura» (pestaña Montura) o envía{" "}
              <span className="text-[#ffc46b]">:e1</span>, <span className="text-[#ffc46b]">:a1</span>… para
              identificar firmware, resolución y temporización.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 font-mono text-[10.5px]">
              {profile.fw && (
                <div className="col-span-2 flex items-baseline justify-between gap-2">
                  <span className="text-dim">firmware</span>
                  <span className="text-ember">{profile.fw}</span>
                </div>
              )}
              {profile.cpr1 !== undefined && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-dim">CPR AR</span>
                  <span className="tabular-nums text-mint">{profile.cpr1.toLocaleString("es-ES")}</span>
                </div>
              )}
              {profile.cpr2 !== undefined && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-dim">CPR DEC</span>
                  <span className="tabular-nums text-mint">{profile.cpr2.toLocaleString("es-ES")}</span>
                </div>
              )}
              {profile.timer !== undefined && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-dim">TMR</span>
                  <span className="tabular-nums text-ion">{profile.timer.toLocaleString("es-ES")}</span>
                </div>
              )}
              {profile.ratio1 !== undefined && (
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-dim">ratio HS</span>
                  <span className="tabular-nums text-ion">×{profile.ratio1}</span>
                </div>
              )}
              {profile.timer !== undefined && profile.cpr1 !== undefined && (
                <div className="col-span-2 flex items-baseline justify-between gap-2 border-t border-line pt-1.5">
                  <span className="text-dim">máx. modo lento</span>
                  <span className="tabular-nums text-fog">
                    {((profile.timer * 360) / profile.cpr1).toFixed(2)}°/s
                  </span>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* ── CONEXIÓN FLIPPER (ajustes) ─────────────────────── */}
      {ajustes && <FlipperConnection flip={flip} />}

      {/* ── DECODIFICADOR (montura) ────────────────────────── */}
      {!ajustes && <DecoderPanel data={decoded} profile={profile} />}

      {/* ── AUTODIAGNÓSTICO (montura) ──────────────────────── */}
      {!ajustes && (
        <section
          className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animationDelay: "120ms" }}
        >
          <Head>Autodiagnóstico</Head>
          <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-dim">
            Secuencia de apertura recomendada: {DIAG_SEQUENCE.length} consultas de solo lectura (versión,
            CPR, timer, ratio, estado, posición), una a una y esperando respuesta.
          </p>

          {auto.running ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between font-mono text-[11px]">
                <span className="text-fog">
                  {auto.step}/{auto.total} · <span className="text-ember">{auto.cmd}</span>
                </span>
                <button
                  onClick={onCancelDiag}
                  className="flex items-center gap-1 rounded border border-alert/50 px-1.5 py-0.5 text-[10px] tracking-wider text-alert transition-colors hover:bg-alert/15"
                >
                  <IconStop className="h-3 w-3" /> CANCELAR
                </button>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#0c1930]">
                <div
                  className="h-full rounded-full bg-ember transition-[width] duration-300"
                  style={{ width: `${(auto.step / auto.total) * 100}%` }}
                />
              </div>
            </div>
          ) : (
            <button
              onClick={onRunDiag}
              disabled={status !== "open"}
              className="mt-2.5 flex w-full items-center justify-center gap-2 rounded border border-ion/50 bg-ion/10 px-3 py-2 font-display text-[11px] font-bold tracking-[0.18em] text-ion transition-all hover:bg-ion/20 hover:shadow-[0_0_16px_rgba(76,201,240,0.2)] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-35"
            >
              <IconRadar className="h-4 w-4" /> ESCANEAR MONTURA
            </button>
          )}
        </section>
      )}

      {/* ── COMANDOS MC (montura) ──────────────────────────── */}
      {!ajustes && (
        <section
          className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animationDelay: "150ms" }}
        >
          <Head>Comandos MC</Head>
          <p className="mt-1.5 font-mono text-[10.5px] leading-relaxed text-dim">
            Canal <span className="text-fog">1</span> = AR · <span className="text-fog">2</span> = DEC ·{" "}
            <span className="text-fog">3</span> = ambos. Los marcados{" "}
            <span className="rounded border border-ion/40 bg-ion/10 px-1 text-[9px] text-ion">EDITAR</span> se
            insertan en la barra para completar sus datos.
            {!open && <span className="text-ember/80"> · conecta para enviar</span>}
          </p>

          <div className="mt-2.5 flex flex-col gap-3">
            {QUICK.map((g) => (
              <div key={g.title}>
                <p className="mb-1 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4d6389]">
                  {g.title}
                </p>
                <div className="flex flex-col gap-1">
                  {g.items.map((c) => (
                    <button
                      key={c.cmd}
                      onClick={() => onQuick(c)}
                      className={`group flex items-center justify-between gap-2 rounded border border-line bg-[#0c1930] px-2 py-[7px] text-left transition-all hover:translate-x-0.5 active:translate-x-0.5 active:scale-[0.995] ${
                        c.danger ? "hover:border-alert/60 hover:bg-alert/10" : "hover:border-ember/50 hover:bg-[#122240]"
                      }`}
                    >
                      <span
                        className={`shrink-0 font-mono text-[12px] font-medium ${
                          c.danger ? "text-[#ff9c9c] group-hover:text-alert" : "text-[#ffc46b]"
                        }`}
                      >
                        {c.cmd}
                      </span>
                      <span className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate text-right font-mono text-[10px] leading-tight text-dim">
                          {c.desc}
                        </span>
                        {c.insert && (
                          <span className="shrink-0 rounded border border-ion/40 bg-ion/10 px-1 py-px text-[8.5px] tracking-wider text-ion">
                            EDITAR
                          </span>
                        )}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── GUÍA DEL PROTOCOLO (montura) ───────────────────── */}
      {!ajustes && (
        <section
          className="rise rounded-md border border-line bg-panel p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
          style={{ animationDelay: "180ms" }}
        >
          <Head>
            <IconBook className="h-3.5 w-3.5" /> Guía del protocolo
          </Head>
          <ul className="mt-2.5 flex flex-col gap-2.5 font-mono text-[11px] leading-relaxed text-[#7d92b8]">
            <li>
              Trama: <span className="text-[#ffc46b]">:CMD canal [datos] CR</span> · respuesta{" "}
              <span className="text-mint">=</span> o error <span className="text-alert">!</span> · sin checksum.
            </li>
            <li>
              Datos hex ASCII con el <span className="text-fog">byte bajo primero</span>: 0x123456 →{" "}
              <span className="text-fog">563412</span>.
            </li>
            <li>
              Posiciones con offset <span className="text-fog">0x800000</span>: lógico 0x001000 →{" "}
              <span className="text-[#ffc46b]">:S1001080</span>.
            </li>
            <li>
              Errores: 0 desconocido · 1 longitud · 2 motor no detenido · 3 carácter inválido · 4 no
              inicializado · 5 driver en sleep · 7 PEC activo · 8 sin datos PEC.
            </li>
            <li>
              <span className="text-ion">Verificado en firmware 2.04</span>: «:G» usa{" "}
              <span className="text-fog">1 byte</span> y «:f» responde <span className="text-fog">3 dígitos</span>,
              un nibble por byte («100»).
            </li>
            <li>
              <span className="text-ion">«!4» en «:J»</span> = encoder sin referencia: se marca home con{" "}
              <span className="text-[#ffc46b]">:F1</span>/<span className="text-[#ffc46b]">:F2</span>. El panel de
              giro lo hace solo y reintenta una vez.
            </li>
            <li>
              Velocidad: <span className="text-fog">T1 = TMR·360 / (°/s · CPR)</span>. Se envía con{" "}
              <span className="text-[#ffc46b]">:I</span> (tracking) y <span className="text-[#ffc46b]">:T</span>{" "}
              (GOTO, ×ratio alta velocidad); si «:T» responde !3 se reintenta con T1.
            </li>
            <li className="rounded border border-alert/30 bg-alert/5 p-2 text-[#d98f8f]">
              Zona roja: «:L» solo en emergencia · «:Q55AA» mete el controlador en bootloader · EEPROM (C/N/n),
              registros (A/R/r) y «:W» pueden dejar la placa inservible.
            </li>
          </ul>
        </section>
      )}
    </aside>
  );
}
