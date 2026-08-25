import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useSerial, type SerialSettings } from "./hooks/useSerial";
import { useFlipper } from "./hooks/useFlipper";
import { asciiOf, fmtBytes, fmtDuration, portLabel, TERMINATIONS, timeNow } from "./lib/serial";
import { audit, installUiAudit } from "./lib/audit";
import {
  cmdParts,
  calculateMotionTiming,
  decodeResponse,
  DIAG_SEQUENCE,
  hexLE,
  le24,
  lowSpeedGotoMarginSteps,
  MAX_GOTO_STEPS,
  MAX_SAFE_ABSOLUTE_GOTO_DELTA,
  MAX_POSITION_DELTA,
  POS_OFFSET,
  posField,
  requiresDangerConfirmation,
  statusFromChars,
  type MountProfile,
  type QuickCmd,
} from "./lib/protocol";
import { capturedAngleDeltaDeg, classifyExtendedPeaks } from "./lib/flipper";
import TerminalLog, { type DisplayMode, type EntryKind, type LogEntry } from "./components/TerminalLog";
import CommandBar, { type CommandBarHandle } from "./components/CommandBar";
import RightPanel, { type Tab } from "./components/RightPanel";
import FlipperLab from "./components/FlipperLab";
import { type AutoState } from "./components/SidePanel";
import { IDLE_MOVE, type MoveInputs, type MoveState } from "./components/DrivePanel";
import type { AxisTestInputs, AxisTestState, ExtendedTestState } from "./components/AxisTestPanel";
import type { DecodedState } from "./components/DecoderPanel";
import HelpModal from "./components/HelpModal";
import FlipperSerialConsole from "./components/FlipperSerialConsole";
import {
  IconActivity,
  IconAlert,
  IconCrosshair,
  IconDownload,
  IconScroll,
  IconTerminal,
  IconTrash,
} from "./components/icons";

const MAX_ENTRIES = 700;
const RX_TIMEOUT_MS = 900;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface MoveRequest {
  axis: 1 | 2;
  speed: number;
  deg: number;
  maxDeg?: number;
  relativeGoto?: boolean;
  onPosition?: (axis: 1 | 2, steps: number, tb: number) => void | Promise<void>;
}

interface ContinuousMoveRequest extends Omit<MoveRequest, "axis"> {
  axis: 1 | 2;
  onTargetReached?: () => void | Promise<void>;
}

const wrapPosition24 = (value: number) => {
  const width = 0x1000000;
  return ((((value + POS_OFFSET) % width) + width) % width) - POS_OFFSET;
};

function Starfield() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      <div className="stars-a" />
      <div className="stars-b" />
    </div>
  );
}

function ActivityMeter({ data }: { data: number[] }) {
  const max = Math.max(4, ...data);
  return (
    <div className="hidden h-6 items-end gap-[3px] xl:flex" title="Actividad RX">
      {data.map((v, i) => (
        <span
          key={i}
          className="w-[3px] rounded-[1px] transition-[height,background-color] duration-300"
          style={{
            height: `${Math.max(10, Math.round((v / max) * 100))}%`,
            backgroundColor: v > 0 ? "rgba(245,165,36,0.85)" : "#1c2f4f",
          }}
        />
      ))}
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const conf =
    status === "open"
      ? { text: "EN LÍNEA", dot: "led led-mint led-breathe", cls: "border-mint/50 bg-mint/5 text-mint" }
      : status === "connecting"
        ? { text: "ABRIENDO…", dot: "led led-ember led-breathe", cls: "border-ember/50 text-ember" }
        : { text: "DESCONECTADO", dot: "led led-off", cls: "border-line text-dim" };
  return (
    <div className={`hidden items-center gap-2 rounded border px-2.5 py-1.5 font-mono text-[10.5px] tracking-wider transition-colors md:flex ${conf.cls}`}>
      <span className={conf.dot} />
      <span>{conf.text}</span>
      {status === "open" && <span className="max-w-[180px] truncate text-mint/60">· {label}</span>}
    </div>
  );
}

function ToolBtn({
  title,
  onClick,
  active,
  children,
}: {
  title: string;
  onClick: () => void;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded border p-1.5 transition-colors ${
        active
          ? "border-ember/60 bg-ember/10 text-ember"
          : "border-line text-dim hover:border-ember/40 hover:text-fog"
      }`}
    >
      {children}
    </button>
  );
}

export default function App() {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const secure = typeof window !== "undefined" && window.isSecureContext;

  const [settings, setSettings] = useState<SerialSettings>({
    baudRate: 9600,
    dataBits: 8,
    stopBits: 1,
    parity: "none",
  });
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [displayMode, setDisplayMode] = useState<DisplayMode>("ascii");
  const [autoscroll, setAutoscroll] = useState(true);
  const [termination, setTermination] = useState("cr");
  const [history, setHistory] = useState<string[]>([]);
  const [counters, setCounters] = useState({ rx: 0, tx: 0 });
  const [activity, setActivity] = useState<number[]>(() => Array(24).fill(0));
  const [rxPulse, setRxPulse] = useState(0);
  const [txPulse, setTxPulse] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [utc, setUtc] = useState(() => new Date().toISOString().slice(11, 19));

  /* barra de comandos + decodificador + autodiagnóstico */
  const [cmd, setCmd] = useState("");
  const [decoded, setDecoded] = useState<DecodedState | null>(null);
  const [profile, setProfile] = useState<MountProfile>({});
  const [axisPosition, setAxisPosition] = useState<{ ar?: number; dec?: number }>({});
  const [auto, setAuto] = useState<AutoState>({
    running: false,
    step: 0,
    total: DIAG_SEQUENCE.length,
    cmd: "",
  });
  const [mvInputs, setMvInputs] = useState<MoveInputs>({ axis: 1, speed: "0.5", deg: "10" });
  const [move, setMove] = useState<MoveState>(IDLE_MOVE);
  const [jogAxis, setJogAxis] = useState<0 | 1 | 2>(0);
  const [axisTestInputs, setAxisTestInputs] = useState<AxisTestInputs>({
    axis: 1,
    direction: "cw",
    revolutions: "1",
    sampleRate: 500,
    speed: "3.34",
  });
  const [axisTest, setAxisTest] = useState<AxisTestState>({
    running: false,
    progress: 0,
    currentDeg: 0,
    targetDeg: 360,
    message: "Listo para una vuelta completa.",
    elapsedSec: 0,
    actualDurationSec: null,
  });
  const [extendedTest, setExtendedTest] = useState<ExtendedTestState>({ running: false, pass: 0, total: 5, message: "" });
  const [helpOpen, setHelpOpen] = useState(false);

  /* pestaña activa + ancho del panel lateral */
  const [tab, setTab] = useState<Tab>("mov");
  const [serialTarget, setSerialTarget] = useState<"mount" | "flipper">("mount");
  const [sideW, setSideW] = useState<number>(() => {
    const v = Number(localStorage.getItem("neq6-sidew"));
    return v >= 300 && v <= 760 ? v : 380;
  });
  const dragRef = useRef<{ x0: number; w0: number } | null>(null);

  const idRef = useRef(0);
  const bufRef = useRef<number[]>([]);
  const pendingRef = useRef<number | undefined>(undefined);
  const rxBytesRef = useRef(0);
  const txBytesRef = useRef(0);
  const lastTickRef = useRef(0);
  const encoderRef = useRef<TextEncoder | null>(null);
  const sessionStartRef = useRef(0);
  const lastCmdKeyRef = useRef<string | null>(null);
  const lastCmdTextRef = useRef<string | null>(null);
  const rxWaitersRef = useRef<Array<(line: string) => void>>([]);
  const autoCancelRef = useRef(false);
  const moveCancelRef = useRef(false);
  const axisTestCancelRef = useRef(false);
  const extendedTestCancelRef = useRef(false);
  const previousSerialStatusRef = useRef<"closed" | "connecting" | "open">("closed");
  const jogRef = useRef<{ axis: 1 | 2 } | null>(null);
  const barRef = useRef<CommandBarHandle>(null);
  const encoder = (encoderRef.current ??= new TextEncoder());

  const baudString = `${settings.baudRate} ${settings.dataBits}${
    settings.parity === "none" ? "N" : settings.parity[0].toUpperCase()
  }${settings.stopBits}`;

  /* ── registro ─────────────────────────────────────────── */
  const entry = (kind: EntryKind, data: { text?: string; bytes?: Uint8Array }): LogEntry => ({
    id: ++idRef.current,
    time: timeNow(),
    kind,
    ...data,
  });

  const addEntries = (list: LogEntry[]) => {
    for (const item of list) {
      audit(`app.${item.kind}`, {
        time: item.time,
        text: item.text ?? (item.bytes ? asciiOf(item.bytes) : ""),
      });
    }
    setEntries((prev) => {
      const next = [...prev, ...list];
      return next.length > MAX_ENTRIES ? next.slice(next.length - MAX_ENTRIES) : next;
    });
  };

  const logSys = (text: string) => addEntries([entry("sys", { text })]);
  const logFault = (text: string) => addEntries([entry("fault", { text })]);

  const makeRxEntry = (line: number[]): LogEntry => {
    const kind: EntryKind = line[0] === 0x3d ? "ok" : line[0] === 0x21 ? "err" : "rx";
    return entry(kind, { bytes: Uint8Array.from(line) });
  };

  /* ── decodificación + perfil + waiters por línea RX ───── */
  const handleRxLine = (bytes: number[]) => {
    const text = String.fromCharCode(...bytes);

    if (rxWaitersRef.current.length) {
      const ws = rxWaitersRef.current;
      rxWaitersRef.current = [];
      ws.forEach((w) => w(text));
    }

    const d = decodeResponse(lastCmdKeyRef.current, text);
    if (d) setDecoded({ cmd: lastCmdTextRef.current, line: text, d });

    const key = lastCmdKeyRef.current;
    if (d?.kind === "value" && key?.[0] === "j" && d.logical !== undefined) {
      setAxisPosition((current) => key[1] === "2" ? { ...current, dec: d.logical } : { ...current, ar: d.logical });
    }
    if (d && (d.kind === "value" || d.kind === "status" || d.kind === "version") && key) {
      const letter = key[0];
      const ch = key[1];
      if (letter === "e") {
        setProfile((p) => ({ ...p, fw: d.raw.toUpperCase() }));
      } else if (letter === "a") {
        setProfile((p) => (ch === "2" ? { ...p, cpr2: d.value } : { ...p, cpr1: d.value }));
      } else if (letter === "b") {
        setProfile((p) => ({ ...p, timer: d.value }));
      } else if (letter === "g") {
        setProfile((p) => (ch === "2" ? { ...p, ratio2: d.value } : { ...p, ratio1: d.value }));
      }
    }
  };

  const waitForRx = (ms: number) =>
    new Promise<string | null>((resolve) => {
      let done = false;
      const fn = (line: string) => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        rxWaitersRef.current = rxWaitersRef.current.filter((f) => f !== fn);
        resolve(line);
      };
      const timer = window.setTimeout(() => {
        if (done) return;
        done = true;
        rxWaitersRef.current = rxWaitersRef.current.filter((f) => f !== fn);
        resolve(null);
      }, ms);
      rxWaitersRef.current.push(fn);
    });

  /* ── datos recibidos del puerto ───────────────────────── */
  const handleData = (chunk: Uint8Array) => {
    rxBytesRef.current += chunk.length;
    setRxPulse((pulse) => pulse + 1);

    const buf = bufRef.current;
    for (let i = 0; i < chunk.length; i++) buf.push(chunk[i]);

    const lines: number[][] = [];
    let start = 0;
    for (let i = 0; i < buf.length; i++) {
      const c = buf[i];
      if (c === 0x0d || c === 0x0a) {
        lines.push(buf.slice(start, i));
        if (c === 0x0d && buf[i + 1] === 0x0a) i++;
        start = i + 1;
      }
    }
    bufRef.current = buf.slice(start);

    const fresh = lines.filter((l) => l.length > 0);
    if (fresh.length) {
      addEntries(fresh.map(makeRxEntry));
      fresh.forEach(handleRxLine);
    }

    window.clearTimeout(pendingRef.current);
    if (bufRef.current.length) {
      pendingRef.current = window.setTimeout(() => {
        if (bufRef.current.length) {
          const leftover = bufRef.current;
          bufRef.current = [];
          addEntries([makeRxEntry(leftover)]);
          handleRxLine(leftover);
        }
      }, 300);
    }
  };

  const handleUnplugged = () => {
    autoCancelRef.current = true;
    moveCancelRef.current = true;
    jogRef.current = null;
    setJogAxis(0);
    logFault("Dispositivo desconectado — revisa el cable USB.");
  };

  const serial = useSerial({ onData: handleData, onDisconnect: handleUnplugged });
  const { status, portInfo, supported: apiOk } = serial;

  /* posición devuelta por :j (24 bits little-endian con offset 0x800000) */
  const parsePosLine = (line: string | null): number | null => {
    if (!line || !line.startsWith("=")) return null;
    const hex = line.slice(1).trim();
    if (!/^[0-9A-Fa-f]{6}$/.test(hex)) return null;
    const logical = hexLE(hex) - POS_OFFSET;
    return logical > 0x7fffff ? logical - 0x1000000 : logical;
  };

  const parseStopped = (line: string | null): boolean | null => {
    if (!line || !line.startsWith("=")) return null;
    const st = statusFromChars(line.slice(1));
    if (!st) return null;
    return (st[1] & 1) === 0; /* byte1·B0: 1=en marcha · 0=parado */
  };

  const flip = useFlipper({
    cpr1: profile.cpr1,
  });

  /* ── mensajes de arranque ─────────────────────────────── */
  useEffect(() => {
    audit("app.loaded", { title: document.title });
    return installUiAudit();
  }, []);

  useEffect(() => {
    if (!supported) {
      logFault("Este navegador no soporta la Web Serial API. Usa Chrome o Edge de escritorio (HTTPS o localhost).");
    } else if (!secure) {
      logFault("Web Serial necesita un contexto seguro: sirve esta página por HTTPS o localhost.");
    } else {
      logSys("Web Serial disponible · NEQ6: 9600 8N1, protocolo MC (el de EQDIRect/EQASCOM).");
      logSys("Abre Ajustes → Conexión montura y elige el conversor UART-USB; el escaneo se inicia al conectar.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── contadores + actividad de tráfico ────────────────── */
  useEffect(() => {
    const iv = window.setInterval(() => {
      const now = rxBytesRef.current;
      setActivity((values) => [...values.slice(-23), Math.max(0, now - lastTickRef.current)]);
      lastTickRef.current = now;
      setCounters({ rx: rxBytesRef.current, tx: txBytesRef.current });
    }, 400);
    return () => window.clearInterval(iv);
  }, []);

  /* ── cronómetro de sesión + reloj UT ──────────────────── */
  useEffect(() => {
    if (status !== "open") {
      setElapsed(0);
      return;
    }
    sessionStartRef.current = Date.now();
    const iv = window.setInterval(
      () => setElapsed(Math.floor((Date.now() - sessionStartRef.current) / 1000)),
      1000,
    );
    return () => window.clearInterval(iv);
  }, [status]);

  useEffect(() => {
    const iv = window.setInterval(() => setUtc(new Date().toISOString().slice(11, 19)), 1000);
    return () => window.clearInterval(iv);
  }, []);

  /* ── acciones de puerto ───────────────────────────────── */
  const handleConnect = async () => {
    try {
      await serial.requestAndOpen(settings);
      logSys(`Puerto abierto · ${baudString}`);
      logSys("Puerto listo: iniciando automáticamente «Escanear montura».");
    } catch (e) {
      const err = e as { name?: string; message?: string };
      if (err.name === "NotFoundError") logSys("Selección de puerto cancelada.");
      else logFault(`No se pudo abrir el puerto: ${err.message ?? String(e)}`);
    }
  };

  const handleOpenAuthorized = async (p: SerialPort) => {
    try {
      await serial.openAuthorized(p, settings);
      logSys(`Puerto abierto · ${baudString}`);
    } catch (e) {
      logFault(`No se pudo abrir el puerto: ${(e as Error).message ?? String(e)}`);
    }
  };

  const handleClose = async () => {
    autoCancelRef.current = true;
    moveCancelRef.current = true;
    jogRef.current = null;
    setJogAxis(0);
    await serial.close();
    logSys("Puerto cerrado.");
  };

  /* ── envío de comandos ────────────────────────────────── */
  const sendRaw = async (raw: string, toHistory = true): Promise<boolean> => {
    if (status !== "open") {
      logFault("No hay puerto abierto: pulsa «Conectar» primero.");
      return false;
    }
    if (requiresDangerConfirmation(raw)) {
      const accepted = window.confirm(
        `COMANDO DE RIESGO\n\n${raw.trim()} puede modificar posición, memoria o firmware de la montura.\n\n¿Quieres enviarlo realmente?`,
      );
      audit("ui.danger-confirmation", { command: raw.trim(), accepted });
      if (!accepted) {
        logSys(`Comando de riesgo ${raw.trim()} cancelado por el usuario.`);
        return false;
      }
    }
    const term = TERMINATIONS.find((t) => t.id === termination)?.value ?? "\r";
    const bytes = encoder.encode(raw + term);
    const parts = cmdParts(raw);
    try {
      lastCmdKeyRef.current = parts ? parts.letter + parts.ch : null;
      lastCmdTextRef.current = raw;
      await serial.write(bytes);
      txBytesRef.current += bytes.length;
      setTxPulse((pulse) => pulse + 1);
      addEntries([entry("tx", { text: raw })]);
      if (toHistory) setHistory((h) => (h[h.length - 1] === raw ? h : [...h.slice(-49), raw]));
      return true;
    } catch (e) {
      logFault(`Error al enviar: ${(e as Error).message ?? String(e)}`);
      return false;
    }
  };

  /* ── autodiagnóstico (doc §13) ────────────────────────── */
  const runDiag = async () => {
    if (status !== "open") {
      logFault("No hay puerto abierto: pulsa «Conectar» primero.");
      return;
    }
    if (auto.running) return;
    if (move.running) {
      logFault("Espera a que termine el giro (o pulsa STOP) antes de escanear.");
      return;
    }
    autoCancelRef.current = false;
    setAuto({ running: true, step: 0, total: DIAG_SEQUENCE.length, cmd: "" });
    logSys(`Autodiagnóstico: ${DIAG_SEQUENCE.length} consultas de solo lectura, una a una (timeout ${RX_TIMEOUT_MS} ms).`);
    for (let i = 0; i < DIAG_SEQUENCE.length; i++) {
      if (autoCancelRef.current) {
        logSys("Autodiagnóstico cancelado.");
        break;
      }
      const c = DIAG_SEQUENCE[i];
      setAuto({ running: true, step: i + 1, total: DIAG_SEQUENCE.length, cmd: c });
      const sent = await sendRaw(c, false);
      if (!sent) break;
      const line = await waitForRx(RX_TIMEOUT_MS);
      if (autoCancelRef.current) break;
      logSys(
        line !== null
          ? `· ${c} → ${asciiOf(Uint8Array.from([...line].map((ch) => ch.charCodeAt(0))))}`
          : `· ${c} → sin respuesta (timeout). ¿Montura alimentada a 12 V? ¿GND común?`,
      );
      await sleep(120);
    }
    if (!autoCancelRef.current) logSys("Autodiagnóstico completado — revisa Ajustes → Montura detectada.");
    setAuto((a) => ({ ...a, running: false, cmd: "" }));
  };

  const cancelDiag = () => {
    autoCancelRef.current = true;
  };

  useEffect(() => {
    const previous = previousSerialStatusRef.current;
    previousSerialStatusRef.current = status;
    if (status !== "open" || previous === "open") return;
    const timer = window.setTimeout(() => void runDiag(), 180);
    return () => window.clearTimeout(timer);
    // runDiag usa el estado del render en el que el puerto ya está abierto.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  /* ── parada / home ────────────────────────────────────── */
  const stopMove = (hard: boolean) => {
    if (status !== "open") return;
    const axis = move.running ? move.axis : mvInputs.axis;
    moveCancelRef.current = true;
    const c = hard ? "L" : "K";
    if (axis === 3) {
      void sendRaw(`:${c}1`, false);
      void sendRaw(`:${c}2`, false);
    } else {
      void sendRaw(`:${c}${axis}`, false);
    }
    logSys(hard ? "Parada inmediata enviada (:L) — solo para emergencias." : "Parada suave enviada (:K).");
  };

  const initHome = async () => {
    if (status !== "open") {
      logFault("No hay puerto abierto: pulsa «Conectar» primero.");
      return;
    }
    if (move.running) {
      logFault("Espera a que termine el giro (o pulsa STOP) antes de marcar home.");
      return;
    }
    for (const c of [":F1", ":F2"]) {
      if (!(await sendRaw(c, false))) return;
      const line = await waitForRx(RX_TIMEOUT_MS);
      if (!line || !line.startsWith("=")) {
        logFault(`${c} rechazado (${line ?? "sin respuesta"}).`);
        return;
      }
    }
    logSys("Home marcado en AR y DEC (:F1 :F2). El controlador ya aceptará :J.");
  };

  /* ── jog manual ───────────────────────────────────────── */
  const waitAxisStopped = async (axis: 1 | 2, timeoutMs = 8000): Promise<boolean> => {
    const deadline = Date.now() + timeoutMs;
    let stoppedStreak = 0;
    while (Date.now() < deadline) {
      if (!(await sendRaw(`:f${axis}`, false))) return false;
      const stopped = parseStopped(await waitForRx(RX_TIMEOUT_MS));
      if (stopped === null) return false;
      stoppedStreak = stopped ? stoppedStreak + 1 : 0;
      if (stoppedStreak >= 2) return true;
      await sleep(100);
    }
    return false;
  };

  const startContinuousAxis = async (
    axis: 1 | 2,
    direction: 1 | -1,
    speed: number,
    allowInit = true,
    isCancelled: () => boolean = () => false,
  ) => {
    const cpr = axis === 2 ? profile.cpr2 : profile.cpr1;
    const timer = profile.timer;
    const ratio = (axis === 2 ? profile.ratio2 : profile.ratio1) || 16;
    if (!cpr || !timer) return null;
    const timing = calculateMotionTiming(timer, cpr, speed, ratio);

    if (!(await sendRaw(`:K${axis}`, false))) return null;
    const rK = await waitForRx(RX_TIMEOUT_MS);
    if (!rK?.startsWith("=")) return null;
    if (isCancelled()) return null;
    if (!(await waitAxisStopped(axis))) {
      logFault(`El eje ${axis} no confirmó parada completa antes de cambiar el modo.`);
      return null;
    }
    if (isCancelled()) return null;

    const mode = timing.highSpeed ? "3" : "1"; /* velocidad rápida/lenta, sin destino */
    if (!(await sendRaw(`:G${axis}${mode}${direction < 0 ? "1" : "0"}`, false))) return null;
    const rG = await waitForRx(RX_TIMEOUT_MS);
    if (isCancelled()) return null;
    if (!rG?.startsWith("=")) {
      logFault(`No se pudo seleccionar movimiento continuo ${timing.highSpeed ? "rápido" : "lento"} (${rG ?? "sin respuesta"}).`);
      return null;
    }
    if (!(await sendRaw(`:I${axis}${le24(timing.t1)}`, false))) return null;
    const rI = await waitForRx(RX_TIMEOUT_MS);
    if (isCancelled()) return null;
    if (!rI?.startsWith("=")) {
      logFault(`La placa rechazó T1=${timing.t1} (${rI ?? "sin respuesta"}).`);
      return null;
    }
    if (!(await sendRaw(`:J${axis}`, false))) return null;
    const rJ = await waitForRx(RX_TIMEOUT_MS);
    if (rJ?.startsWith("=")) {
      if (isCancelled()) {
        await sendRaw(`:K${axis}`, false);
        await waitForRx(RX_TIMEOUT_MS);
        return null;
      }
      return timing;
    }

    if (allowInit && rJ?.startsWith("!4")) {
      logSys(":J rechazado con !4 — marco home (:F) y reconfiguro el movimiento continuo.");
      if (!(await sendRaw(`:F${axis}`, false))) return null;
      const rF = await waitForRx(RX_TIMEOUT_MS);
      if (!rF?.startsWith("=")) return null;
      return startContinuousAxis(axis, direction, speed, false, isCancelled);
    }
    logFault(`:J${axis} rechazado (${rJ ?? "sin respuesta"}) — movimiento cancelado.`);
    return null;
  };

  const failJog = () => {
    jogRef.current = null;
    setJogAxis(0);
  };

  const startJog = async (axis: 1 | 2, dir: 1 | -1) => {
    if (status !== "open" || move.running || auto.running || jogRef.current) return;
    const cpr = axis === 2 ? profile.cpr2 : profile.cpr1;
    const timer = profile.timer;
    if (!cpr || !timer) {
      logFault("Faltan CPR/timer: ejecuta «Escanear montura» en Serial → Serial montura.");
      return;
    }
    const speed = parseFloat(mvInputs.speed.replace(",", ".")) || 0.5;
    jogRef.current = { axis };
    setJogAxis(axis);
    const timing = await startContinuousAxis(axis, dir, speed, true, () => !jogRef.current);
    if (!timing || !jogRef.current) return failJog();
    logSys(
      `Jog continuo ${axis === 1 ? "AR" : "DEC"} ${dir > 0 ? "+" : "−"} · ` +
        `${timing.highSpeed ? "rápido" : "lento"} · T1=${timing.t1} · ≈${timing.realDegPerSec.toFixed(3)}°/s.`,
    );
  };

  const stopJog = () => {
    const j = jogRef.current;
    jogRef.current = null;
    setJogAxis(0);
    if (j && status === "open") {
      void sendRaw(`:K${j.axis}`, false);
      logSys(`Jog parado (:K${j.axis}).`);
    }
  };

  /* Movimiento a velocidad constante. No se programa un destino en la placa:
   * el navegador vigila el contador :j y solicita :K al cruzar el recorrido. */
  const runContinuousMove = async (request: ContinuousMoveRequest): Promise<boolean> => {
    if (status !== "open" || move.running || auto.running) return false;
    const { axis, speed, deg } = request;
    const cpr = axis === 2 ? profile.cpr2 : profile.cpr1;
    const timer = profile.timer;
    const ratio = (axis === 2 ? profile.ratio2 : profile.ratio1) || 16;
    if (!cpr || !timer || !isFinite(speed) || speed <= 0 || !isFinite(deg) || deg === 0) {
      logFault("No se puede iniciar el movimiento continuo: revisa CPR, timer, velocidad y grados.");
      return false;
    }
    const maxDeg = request.maxDeg ?? 3602;
    if (Math.abs(deg) > maxDeg) {
      logFault(`Recorrido continuo fuera de límite (máx. ±${maxDeg}°).`);
      return false;
    }

    const timing = calculateMotionTiming(timer, cpr, speed, ratio);
    const direction: 1 | -1 = deg > 0 ? 1 : -1;
    const targetSteps = Math.max(1, Math.round((Math.abs(deg) * cpr) / 360));
    moveCancelRef.current = false;
    setMove({
      running: true,
      axis,
      total: Math.abs(deg),
      done: 0,
      speed,
      real: timing.realDegPerSec,
      t1: timing.t1,
      chunks: 1,
      chunk: 1,
      phase: "preparando movimiento continuo",
    });
    logSys(
      `Movimiento continuo ${timing.highSpeed ? "rápido" : "lento"} · ${Math.abs(deg)}° · ` +
        `T1=${timing.t1} · ${timing.realDegPerSec.toFixed(4)}°/s.`,
    );

    const startedTiming = await startContinuousAxis(axis, direction, speed, true, () => moveCancelRef.current);
    if (!startedTiming || moveCancelRef.current) {
      setMove(IDLE_MOVE);
      return false;
    }
    setMove((state) => ({ ...state, phase: "velocidad estable · feedback :j" }));

    let previousPosition: number | null = null;
    let travelledSteps = 0;
    let reached = false;
    let communicationError = false;
    let stopSent = false;
    const deadline = Date.now() + (Math.abs(deg) / startedTiming.realDegPerSec) * 1000 * 1.5 + 20000;
    while (!moveCancelRef.current && Date.now() < deadline) {
      const requestedAt = Date.now();
      if (!(await sendRaw(`:j${axis}`, false))) {
        communicationError = true;
        break;
      }
      const position = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
      if (position === null) {
        communicationError = true;
        break;
      }
      const tb = (requestedAt + Date.now()) / 2;
      if (previousPosition !== null) {
        let delta = position - previousPosition;
        if (delta > MAX_POSITION_DELTA) delta -= 0x1000000;
        else if (delta < -MAX_POSITION_DELTA) delta += 0x1000000;
        travelledSteps += delta;
      }
      previousPosition = position;
      await request.onPosition?.(axis, position, tb);
      const doneSteps = Math.abs(travelledSteps);
      const doneDeg = Math.min(Math.abs(deg), (doneSteps * 360) / cpr);
      setMove((state) => ({ ...state, done: doneDeg }));
      if (doneSteps >= targetSteps) {
        reached = true;
        if (status === "open") {
          await sendRaw(`:K${axis}`, false);
          await waitForRx(RX_TIMEOUT_MS);
          stopSent = true;
        }
        await request.onTargetReached?.();
        break;
      }
      await sleep(request.onPosition ? 120 : 180);
    }

    if (status === "open" && !stopSent) {
      await sendRaw(`:K${axis}`, false);
      await waitForRx(RX_TIMEOUT_MS);
      stopSent = true;
    }
    if (status === "open" && stopSent) await waitAxisStopped(axis, 12000);
    if (communicationError) logFault("Se perdió el feedback :j durante el movimiento continuo; se envió STOP.");
    else if (!reached && !moveCancelRef.current) logFault("El movimiento continuo no alcanzó el recorrido antes del timeout; se envió STOP.");
    else if (reached) logSys(`Recorrido continuo confirmado por :j: ${Math.abs(deg).toFixed(2)}°.`);
    setMove(IDLE_MOVE);
    return reached && !moveCancelRef.current && !communicationError;
  };

  /* ── giro de alto nivel ───────────────────────────────── */
  const runMove = async (request?: MoveRequest): Promise<boolean> => {
    if (status !== "open") {
      logFault("No hay puerto abierto: pulsa «Conectar» primero.");
      return false;
    }
    if (move.running || auto.running) return false;

    const axis = request?.axis ?? mvInputs.axis;
    const speed = request?.speed ?? parseFloat(mvInputs.speed.replace(",", "."));
    const deg = request?.deg ?? parseFloat(mvInputs.deg.replace(",", "."));
    if (!isFinite(speed) || speed <= 0) {
      logFault("Velocidad no válida: usa un valor mayor que 0 (p. ej. 0,5).");
      return false;
    }
    const maxDeg = request?.maxDeg ?? 720;
    if (!isFinite(deg) || deg === 0 || Math.abs(deg) > maxDeg) {
      logFault(`Grados no válidos: usa un valor distinto de 0 (máx. ±${maxDeg}). Negativo = sentido contrario.`);
      return false;
    }

    const cpr = axis === 2 ? profile.cpr2 : profile.cpr1;
    const timer = profile.timer;
    if (!cpr || !timer) {
      logFault("Faltan CPR/timer: ejecuta «Escanear montura» en Serial → Serial montura con el puerto abierto.");
      return false;
    }

    const sign = deg > 0 ? 1 : -1;
    const primaryRatio = (axis === 2 ? profile.ratio2 : profile.ratio1) || 16;
    const timing = calculateMotionTiming(timer, cpr, speed, primaryRatio);
    const { t1, realDegPerSec: real } = timing;
    const stepsPerDeg = cpr / 360;
    const totalSteps = Math.max(1, Math.round(Math.abs(deg) * stepsPerDeg));
    const chunkLimit = request?.relativeGoto ? MAX_GOTO_STEPS : MAX_SAFE_ABSOLUTE_GOTO_DELTA;
    const chunks = Math.max(1, Math.ceil(totalSteps / chunkLimit));
    const axes: (1 | 2)[] = axis === 3 ? [1, 2] : [axis as 1 | 2];

    moveCancelRef.current = false;
    setMove({
      running: true,
      axis,
      total: Math.abs(deg),
      done: 0,
      speed,
      real,
      t1,
      chunks,
      chunk: 0,
      phase: "iniciando",
    });
    logSys(
      `Giro de ${Math.abs(deg)}° (${axis === 3 ? "AR+DEC" : axis === 1 ? "AR" : "DEC"}) a ${speed}°/s · ` +
        `${totalSteps.toLocaleString("es-ES")} pasos · T1=${t1} (real ≈ ${real.toFixed(3)}°/s)` +
        (chunks > 1 ? ` · ${chunks} tramos` : ""),
    );
    if (timing.limited)
      logSys(`Velocidad limitada a ${real.toFixed(3)}°/s: máximo calculado con T1=6 para esta montura.`);

    let aborted = false;
    let doneDeg = 0;
    let inited = false;

    for (let ci = 0; ci < chunks; ci++) {
      if (aborted || moveCancelRef.current) break;

      setMove((m) => ({ ...m, chunk: ci + 1, phase: "confirmando parada completa (:K → :f)" }));
      for (const ax of axes) {
        if (!(await sendRaw(`:K${ax}`, false))) {
          aborted = true;
          break;
        }
        const rK = await waitForRx(RX_TIMEOUT_MS);
        if (!rK?.startsWith("=") || !(await waitAxisStopped(ax))) {
          logFault(`El eje ${ax} no confirmó parada completa antes del GOTO.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;

      /* 1) leer posición actual de cada eje */
      setMove((m) => ({ ...m, chunk: ci + 1, phase: "leyendo posición (:j)" }));
      const chunkSteps = Math.min(chunkLimit, totalSteps - ci * chunkLimit);
      const target: Record<number, number> = {};
      for (const ax of axes) {
        if (!(await sendRaw(`:j${ax}`, false))) {
          aborted = true;
          break;
        }
        const positionRequestAt = Date.now();
        const pos = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
        if (moveCancelRef.current) break;
        if (pos === null) {
          logFault(`:j${ax} no devolvió una posición válida — giro cancelado.`);
          aborted = true;
          break;
        }
        await request?.onPosition?.(ax, pos, (positionRequestAt + Date.now()) / 2);
        if (!request?.relativeGoto) target[ax] = wrapPosition24(pos + sign * chunkSteps);
      }
      if (aborted || moveCancelRef.current) break;

      const highSpeedGoto = timing.highSpeed && chunkSteps > lowSpeedGotoMarginSteps(cpr);
      const lowModeMax = (timer * 360) / (6 * cpr);
      const gotoTiming = highSpeedGoto
        ? timing
        : calculateMotionTiming(timer, cpr, Math.min(speed, lowModeMax), 1);

      /* El modo debe seleccionarse con el motor parado y antes de sus
       * parámetros. GOTO rápido sólo se usa si lo exige la velocidad, nunca
       * sólo porque el recorrido sea largo. */
      const gotoCommand = request?.relativeGoto ? ":H" : ":S";
      setMove((m) => ({ ...m, phase: `armando GOTO ${highSpeedGoto ? "rápido" : "lento"} (:G)` }));
      for (const ax of axes) {
        const gotoMode = highSpeedGoto ? "0" : "2";
        if (!(await sendRaw(`:G${ax}${gotoMode}${sign < 0 ? "1" : "0"}`, false))) {
          aborted = true;
          break;
        }
        const rG = await waitForRx(RX_TIMEOUT_MS);
        if (moveCancelRef.current) break;
        if (!rG || !rG.startsWith("=")) {
          logFault(`:G${ax}${gotoMode} rechazado (${rG ?? "sin respuesta"}) — giro cancelado.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;

      /* 2) fijar el T1 correspondiente al modo ya seleccionado. */
      setMove((m) => ({ ...m, phase: "fijando periodo (:I → :T)" }));
      for (const ax of axes) {
        if (!(await sendRaw(`:I${ax}${le24(gotoTiming.t1)}`, false))) {
          aborted = true;
          break;
        }
        const rI = await waitForRx(RX_TIMEOUT_MS);
        if (moveCancelRef.current) break;
        if (!rI || !rI.startsWith("=")) {
          logFault(`:I${ax}${le24(gotoTiming.t1)} rechazado (${rI ?? "sin respuesta"}).`);
          aborted = true;
          break;
        }

        if (!(await sendRaw(`:T${ax}${le24(gotoTiming.t1)}`, false))) {
          aborted = true;
          break;
        }
        const rT = await waitForRx(RX_TIMEOUT_MS);
        if (moveCancelRef.current) break;
        if (!rT || !rT.startsWith("=")) {
          logFault(`:T${ax}${le24(gotoTiming.t1)} rechazado (${rT ?? "sin respuesta"}) — giro cancelado.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;

      setMove((m) => ({ ...m, phase: `fijando destino (${gotoCommand})` }));
      for (const ax of axes) {
        const targetCommand = request?.relativeGoto
          ? `:H${ax}${le24(chunkSteps)}`
          : `:S${ax}${posField(target[ax])}`;
        if (!(await sendRaw(targetCommand, false))) {
          aborted = true;
          break;
        }
        const rS = await waitForRx(RX_TIMEOUT_MS);
        if (moveCancelRef.current) break;
        if (!rS || !rS.startsWith("=")) {
          logFault(`${gotoCommand}${ax} rechazado (${rS ?? "sin respuesta"}) — giro cancelado.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;

      /* EQMOD/INDI siempre programa el punto de frenado antes de :J. Sin :M
       * queda activo un valor anterior y el eje puede pasar casi todo el GOTO
       * en la rampa lenta. */
      setMove((m) => ({ ...m, phase: "configurando frenado (:M)" }));
      const brakeSteps = Math.min(chunkSteps, highSpeedGoto ? 3200 : 200);
      for (const ax of axes) {
        if (!(await sendRaw(`:M${ax}${le24(brakeSteps)}`, false))) {
          aborted = true;
          break;
        }
        const rM = await waitForRx(RX_TIMEOUT_MS);
        if (!rM || !rM.startsWith("=")) {
          logFault(`:M${ax} rechazado (${rM ?? "sin respuesta"}) — giro cancelado.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;

      setMove((m) => ({ ...m, phase: "arrancando motor (:J)" }));
      let retryChunk = false;
      for (const ax of axes) {
        if (!(await sendRaw(`:J${ax}`, false))) {
          aborted = true;
          break;
        }
        const rJ = await waitForRx(RX_TIMEOUT_MS);
        if (moveCancelRef.current) break;
        if (!rJ || !rJ.startsWith("=")) {
          const code = rJ ? rJ.slice(1).trim() : "";
          if (code.startsWith("4") && !inited) {
            inited = true;
            logSys(":J rechazado con !4 — el encoder no tiene referencia. Marco home (:F) y reintento el tramo.");
            let okF = true;
            for (const fax of axes) {
              if (moveCancelRef.current) {
                okF = false;
                break;
              }
              if (!(await sendRaw(`:F${fax}`, false))) {
                okF = false;
                break;
              }
              const rF = await waitForRx(RX_TIMEOUT_MS);
              if (!rF || !rF.startsWith("=")) {
                logFault(`:F${fax} rechazado (${rF ?? "sin respuesta"}) — no se pudo marcar home. Cancelado.`);
                okF = false;
                break;
              }
            }
            if (!okF) {
              aborted = true;
              break;
            }
            ci--; /* se reintenta el mismo tramo */
            retryChunk = true;
            break;
          }
          logFault(`:J${ax} rechazado (${rJ ?? "sin respuesta"}) — giro cancelado.`);
          aborted = true;
          break;
        }
      }
      if (aborted || moveCancelRef.current) break;
      if (retryChunk) continue;

      /* 4) vigilar :f hasta que el eje pare (2 lecturas seguidas) */
      setMove((m) => ({ ...m, phase: "moviendo" }));
      await sleep(600);
      const chunkDeg = chunkSteps / stepsPerDeg;
      const deadline = Date.now() + (chunkDeg / real) * 1000 * 1.8 + 20000;
      let streak = 0;
      let chunkCompleted = false;
      while (Date.now() < deadline) {
        if (moveCancelRef.current) break;
        let allStopped = true;
        let ok = true;
        for (const ax of axes) {
          if (request?.onPosition) {
            const positionRequestAt = Date.now();
            if (!(await sendRaw(`:j${ax}`, false))) {
              ok = false;
              break;
            }
            const position = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
            if (position === null) {
              ok = false;
              break;
            }
            await request.onPosition(ax, position, (positionRequestAt + Date.now()) / 2);
          }
          if (!(await sendRaw(`:f${ax}`, false))) {
            ok = false;
            break;
          }
          const stopped = parseStopped(await waitForRx(RX_TIMEOUT_MS));
          if (stopped === null) {
            ok = false;
            break;
          }
          if (!stopped) {
            allStopped = false;
            break;
          }
        }
        if (!ok) {
          logFault("Se perdió la comunicación durante el giro.");
          aborted = true;
          break;
        }
        streak = allStopped ? streak + 1 : 0;
        if (streak >= 2) {
          chunkCompleted = true;
          break;
        }
        await sleep(request?.onPosition ? 180 : 400);
      }
      if (aborted) break;
      if (!moveCancelRef.current && !chunkCompleted) {
        logFault("El eje no confirmó la parada antes del tiempo límite; se envía STOP por seguridad.");
        for (const ax of axes) await sendRaw(`:K${ax}`, false);
        aborted = true;
        break;
      }

      if (request?.onPosition && !moveCancelRef.current) {
        for (const ax of axes) {
          const positionRequestAt = Date.now();
          if (!(await sendRaw(`:j${ax}`, false))) continue;
          const position = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
          if (position !== null) await request.onPosition(ax, position, (positionRequestAt + Date.now()) / 2);
        }
      }

      doneDeg = Math.min(Math.abs(deg), doneDeg + chunkDeg);
      setMove((m) => ({ ...m, done: doneDeg }));
    }

    if (moveCancelRef.current) logSys("Giro detenido por el usuario.");
    else if (!aborted) logSys(`Giro de ${Math.abs(deg)}° completado (≈${(Math.abs(deg) / real).toFixed(1)} s teóricos).`);
    setMove(IDLE_MOVE);
    return !moveCancelRef.current && !aborted;
  };

  const startAxisTest = async (testInputs = axisTestInputs, preserveExtended = false): Promise<boolean> => {
    if (axisTest.running || move.running || auto.running || jogRef.current) return false;
    const revolutions = Number(testInputs.revolutions.replace(",", "."));
    const speed = Number(testInputs.speed.replace(",", "."));
    const axis = testInputs.axis;
    const measurementSign = testInputs.direction === "cw" ? 1 : -1;
    const cpr = axis === 1 ? profile.cpr1 : profile.cpr2;
    const targetDeg = revolutions * 360;
    if (
      status !== "open" ||
      !flip.connected ||
      !flip.sync ||
      !cpr ||
      !Number.isInteger(revolutions) ||
      revolutions < 1 ||
      revolutions > 10 ||
      !isFinite(speed) ||
      speed <= 0 ||
      speed > 5
    ) {
      logFault("Test no iniciado: revisa montura, Flipper, CPR, revoluciones y velocidad.");
      return false;
    }

    axisTestCancelRef.current = false;
    if (!preserveExtended) {
      flip.setExtendedAnalysis(null);
      flip.resetExtendedArchive();
    }
    flip.clearData();
    setAxisTest({
      running: true,
      progress: 0,
      currentDeg: 0,
      targetDeg,
      message: "Retrocediendo 2° para tomar impulso…",
      elapsedSec: 0,
      actualDurationSec: null,
    });

    /* El retroceso corto usa un destino absoluto :S. En este controlador se ha
     * observado que :H puede conservar el sentido del GOTO anterior pese a
     * cambiar el bit de :G. :S fuerza aquí una posición realmente opuesta. */
    const preRollOk = await runMove({ axis, speed, deg: -2 * measurementSign, maxDeg: 5 });
    if (!preRollOk || axisTestCancelRef.current) {
      setAxisTest((state) => ({
        ...state,
        running: false,
        message: axisTestCancelRef.current
          ? "Test cancelado durante la toma de impulso; no se adquirieron datos."
          : "No se pudo completar la toma de impulso de 2°.",
      }));
      return false;
    }

    setAxisTest((state) => ({ ...state, message: "Motor en marcha; esperando el cruce por 0°…" }));
    let motionPreviousPosition: number | null = null;
    let acquisitionPreviousPosition: number | null = null;
    let preRollTravelledSteps = 0;
    let travelledSteps = 0;
    const totalSteps = revolutions * cpr;
    const preRollSteps = (2 * cpr) / 360;
    let moveSuccess = false;
    let captureStarted = false;
    let captureStopped = false;
    let captureFailed = false;
    let testStartedAt: number | null = null;
    try {
      moveSuccess = await runContinuousMove({
        axis,
        speed,
        deg: (targetDeg + 2) * measurementSign,
        maxDeg: 3602,
        onTargetReached: async () => {
          /* La última consulta periódica puede quedar a 1–2° del STOP. Se
           * toma una ancla final una vez detenido para cerrar exactamente en
           * 360° y no recortar la corona al dibujar la vuelta. */
          if (captureStarted && acquisitionPreviousPosition !== null) {
            const finalAt = Date.now();
            if (await sendRaw(`:j${axis}`, false)) {
              const finalPosition = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
              if (finalPosition !== null) {
                let delta = finalPosition - acquisitionPreviousPosition;
                if (delta > MAX_POSITION_DELTA) delta -= 0x1000000;
                else if (delta < -MAX_POSITION_DELTA) delta += 0x1000000;
                travelledSteps += delta;
                acquisitionPreviousPosition = finalPosition;
                flip.recordAngle((travelledSteps * 360) / cpr, finalAt);
              }
            }
          }
          if (captureStarted && !captureStopped) {
            await flip.stopCapture();
            captureStopped = true;
          }
        },
        onPosition: async (reportedAxis, steps, tb) => {
          if (reportedAxis !== axis) return;
          if (motionPreviousPosition !== null) {
            let delta = steps - motionPreviousPosition;
            if (delta > MAX_POSITION_DELTA) delta -= 0x1000000;
            else if (delta < -MAX_POSITION_DELTA) delta += 0x1000000;
            preRollTravelledSteps += delta;
          }
          motionPreviousPosition = steps;

          if (!captureStarted) {
            const impulseDeg = (Math.abs(preRollTravelledSteps) * 360) / cpr;
            setAxisTest((state) => ({
              ...state,
              message: `Tomando impulso hasta 0° (${Math.min(2, impulseDeg).toFixed(2)}° / 2,00°)…`,
            }));
            if (Math.abs(preRollTravelledSteps) < preRollSteps) return;
            captureStarted = await flip.startCapture(testInputs.sampleRate);
            if (!captureStarted) {
              captureFailed = true;
              moveCancelRef.current = true;
              return;
            }
            testStartedAt = performance.now();
            acquisitionPreviousPosition = steps;
            flip.setCaptureMetadata({
              axis,
              direction: testInputs.direction,
              originSteps: steps,
            });
            /* El origen de la prueba es el cruce de adquisición, no el cero
             * interno arbitrario del contador :j de la controladora. */
            flip.recordAngle(0, tb);
            setAxisTest((state) => ({ ...state, message: "Cruce por 0° confirmado por :j; adquiriendo…" }));
            return;
          }

          if (acquisitionPreviousPosition !== null) {
            let delta = steps - acquisitionPreviousPosition;
            if (delta > MAX_POSITION_DELTA) delta -= 0x1000000;
            else if (delta < -MAX_POSITION_DELTA) delta += 0x1000000;
            travelledSteps += delta;
          }
          acquisitionPreviousPosition = steps;
          flip.recordAngle((travelledSteps * 360) / cpr, tb);
          const currentDeg = Math.min(targetDeg, (Math.abs(travelledSteps) * 360) / cpr);
          setAxisTest((state) => ({
            ...state,
            currentDeg,
            progress: totalSteps ? Math.min(1, Math.abs(travelledSteps) / totalSteps) : 0,
            message: "Adquiriendo corriente y posición…",
            elapsedSec: testStartedAt ? (performance.now() - testStartedAt) / 1000 : 0,
          }));
        },
      });
    } finally {
      if (captureStarted && !captureStopped) await flip.stopCapture();
    }

    const cancelled = axisTestCancelRef.current;
    const actualDurationSec = testStartedAt ? (performance.now() - testStartedAt) / 1000 : 0;
    const measuredDeg = (Math.abs(travelledSteps) * 360) / cpr;
    const feedbackComplete = measuredDeg >= targetDeg * 0.995;
    const success = moveSuccess && captureStarted && feedbackComplete;
    if (moveSuccess && !feedbackComplete) {
      logFault(
        `Movimiento detenido en ${measuredDeg.toFixed(2)}° de ${targetDeg.toFixed(2)}° según :j. ` +
          "La captura queda marcada como incompleta.",
      );
    }
    setAxisTest((state) => ({
      ...state,
      running: false,
      progress: totalSteps ? Math.min(1, Math.abs(travelledSteps) / totalSteps) : 0,
      currentDeg: Math.min(targetDeg, measuredDeg),
      elapsedSec: actualDurationSec,
      actualDurationSec,
      message: cancelled
        ? "Test detenido por el usuario; los datos parciales se conservan."
        : captureFailed
          ? "El ADC no confirmó START al cruzar 0°; motor detenido."
        : success
          ? "Test completado; datos listos para revisar o exportar."
          : moveSuccess
            ? `Captura incompleta: :j confirmó ${measuredDeg.toFixed(1)}° de ${targetDeg.toFixed(0)}°.`
            : "Test interrumpido por un error; revisa el registro.",
    }));
    return success && !cancelled;
  };

  const startExtendedAxisTest = async () => {
    if (extendedTest.running || axisTest.running || move.running || auto.running || jogRef.current) return;
    const fast = Number(axisTestInputs.speed.replace(",", "."));
    if (!(fast > 0)) return;
    const slow = Math.max(0.01, fast / 2);
    const fastRate = axisTestInputs.sampleRate;
    /* Hz/velocidad constante => aproximadamente las mismas muestras por grado
     * en las dos velocidades. */
    const slowRate = Math.max(10, Math.min(1000, Math.round(fastRate * slow / fast)));
    const passes = [
      { id: "noise", label: `ruido · motores parados · ${fastRate} Hz`, direction: "stationary" as const, speed: 0, sampleRate: fastRate, stationary: true as const },
      { id: "fast-cw", label: `rápida CW · ${fast.toFixed(3)}°/s · ${fastRate} Hz`, direction: "cw" as const, speed: fast, sampleRate: fastRate, stationary: false as const },
      { id: "fast-ccw", label: `rápida CCW · ${fast.toFixed(3)}°/s · ${fastRate} Hz`, direction: "ccw" as const, speed: fast, sampleRate: fastRate, stationary: false as const },
      { id: "slow-cw", label: `lenta CW · ${slow.toFixed(3)}°/s · ${slowRate} Hz`, direction: "cw" as const, speed: slow, sampleRate: slowRate, stationary: false as const },
      { id: "slow-ccw", label: `lenta CCW · ${slow.toFixed(3)}°/s · ${slowRate} Hz`, direction: "ccw" as const, speed: slow, sampleRate: slowRate, stationary: false as const },
    ];
    extendedTestCancelRef.current = false;
    flip.setExtendedAnalysis(null);
    flip.resetExtendedArchive();
    setExtendedTest({ running: true, pass: 0, total: passes.length, message: "Preparando test extendido…" });
    const results = [];
    for (let index = 0; index < passes.length; index++) {
      if (extendedTestCancelRef.current) break;
      const pass = passes[index];
      setExtendedTest({ running: true, pass: index + 1, total: passes.length, message: `Fase ${index + 1}/${passes.length} · ${pass.label}` });
      let ok = false;
      if (pass.stationary) {
        flip.clearData();
        flip.setCaptureMetadata({ axis: axisTestInputs.axis, direction: null, originSteps: null });
        ok = await flip.startCapture(pass.sampleRate);
        if (ok) {
          const noiseDurationMs = 20_000;
          const started = performance.now();
          while (!extendedTestCancelRef.current && performance.now() - started < noiseDurationMs) {
            const remaining = Math.max(0, (noiseDurationMs - (performance.now() - started)) / 1000);
            setExtendedTest({ running: true, pass: index + 1, total: passes.length, message: `Midiendo ruido con motores parados · ${remaining.toFixed(0)} s` });
            await sleep(250);
          }
          await flip.stopCapture();
          ok = !extendedTestCancelRef.current;
        }
      } else {
        const inputs: AxisTestInputs = { ...axisTestInputs, direction: pass.direction, speed: String(pass.speed), sampleRate: pass.sampleRate };
        ok = await startAxisTest(inputs, true);
      }
      if (!ok || extendedTestCancelRef.current) break;
      const result = flip.snapshotExtendedPass(pass.id, pass.label, pass.direction, pass.speed);
      if (result) {
        results.push(result);
        flip.archiveExtendedPass(pass.id);
        /* Publicar cada pasada inmediatamente mantiene sus curvas y sus
         * estadísticas visibles mientras se adquiere la siguiente. */
        flip.setExtendedAnalysis({ createdAt: Date.now(), passes: [...results], groups: classifyExtendedPeaks(results) });
      }
      await sleep(500);
    }
    const completed = results.length === passes.length;
    if (results.length) {
      flip.setExtendedAnalysis({ createdAt: Date.now(), passes: results, groups: classifyExtendedPeaks(results) });
    }
    setExtendedTest({
      running: false,
      pass: results.length,
      total: passes.length,
      message: completed ? "Test extendido completado: clasificación FFT disponible." : "Test extendido interrumpido; se conservan las pasadas completadas.",
    });
  };

  const stopAxisTest = () => {
    axisTestCancelRef.current = true;
    extendedTestCancelRef.current = true;
    setAxisTest((state) => ({ ...state, message: "Enviando parada inmediata…" }));
    stopMove(true);
    void flip.stopCapture();
  };

  const moveToCapturedAngle = async (angle: number) => {
    if (status !== "open" || move.running || axisTest.running || extendedTest.running || auto.running) {
      logFault("No se puede reposicionar mientras la montura está desconectada u ocupada.");
      return;
    }
    const metadata = flip.captureMetadata;
    const axis = metadata.axis ?? axisTestInputs.axis;
    const cpr = axis === 1 ? profile.cpr1 : profile.cpr2;
    if (!cpr) {
      logFault("Falta el CPR del eje: ejecuta «Escanear montura».");
      return;
    }
    if (!(await sendRaw(`:j${axis}`, false))) return;
    const current = parsePosLine(await waitForRx(RX_TIMEOUT_MS));
    if (current === null) {
      logFault("No se pudo leer la posición actual con :j.");
      return;
    }
    if (metadata.originSteps === null || metadata.direction === null) {
      logFault("La captura no conserva origen/sentido; no es seguro reposicionar desde esta gráfica.");
      return;
    }
    const normalized = ((angle % 360) + 360) % 360;
    const deltaDeg = capturedAngleDeltaDeg(current, cpr, metadata, normalized);
    if (deltaDeg === null) return;
    if (Math.abs(deltaDeg) < 0.002) {
      logSys(`La montura ya está en ${normalized.toFixed(2)}°.`);
      return;
    }
    const configuredSpeed = Number(axisTestInputs.speed.replace(",", "."));
    logSys(
      `Reposicionando ${axis === 1 ? "AR" : "DEC"} al punto ${normalized.toFixed(2)}° ` +
      `de la captura ${metadata.direction.toUpperCase()} con destino absoluto :S.`,
    );
    await runMove({
      axis,
      speed: Number.isFinite(configuredSpeed) && configuredSpeed > 0 ? configuredSpeed : 0.5,
      deg: deltaDeg,
      maxDeg: 360,
      /* El :S recibe el destino reconstruido desde el :j que se guardó como
       * origen de la captura; no depende de la coordenada ecuatorial de la UI. */
      relativeGoto: false,
    });
  };

  /* ── comandos rápidos / inserción en barra ────────────── */
  const handleQuick = (item: QuickCmd) => {
    if (item.insert) {
      setCmd(item.cmd);
      barRef.current?.focus();
      if (status !== "open") logSys("Puerto cerrado: el comando quedó en la barra, listo para completar.");
    } else {
      void sendRaw(item.cmd);
    }
  };

  const clearLog = () => {
    bufRef.current = [];
    window.clearTimeout(pendingRef.current);
    setEntries([]);
  };

  const exportLog = () => {
    if (!entries.length) {
      logSys("Nada que exportar todavía.");
      return;
    }
    const tagOf: Record<EntryKind, string> = { tx: "TX ", rx: "RX ", ok: "OK ", err: "ERR", sys: "SYS", fault: "FAL" };
    const lines = entries.map((e) => `${e.time}  ${tagOf[e.kind]}  ${e.text ?? (e.bytes ? asciiOf(e.bytes) : "")}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `neq6-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    logSys(`Registro exportado (${entries.length} líneas).`);
  };

  /* ── redimensionado del panel lateral ─────────────────── */
  const onDividerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    dragRef.current = { x0: e.clientX, w0: sideW };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };
  const onDividerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const w = Math.min(760, Math.max(300, d.w0 + (d.x0 - e.clientX)));
    setSideW(w);
    localStorage.setItem("neq6-sidew", String(w));
  };
  const onDividerUp = () => {
    dragRef.current = null;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  };

  /* ── UI ───────────────────────────────────────────────── */
  const sideStyle = { "--side-w": `${sideW}px` } as CSSProperties;

  return (
    <div className="relative z-10 flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <Starfield />
      {/* cabecera */}
      <header className="rise flex h-14 shrink-0 items-center gap-3 border-b border-line bg-[#0a1424]/90 px-4 backdrop-blur">
        <IconCrosshair className="spin-slow h-7 w-7 shrink-0 text-ember" />
        <div className="min-w-0">
          <h1 className="font-display text-[15px] font-bold leading-none tracking-[0.16em] text-[#e8f0ff]">
            NEQ6 <span className="text-ember">-</span> AJUSTE SINFÍN-CORONA
          </h1>
        </div>

        <div className="ml-auto flex items-center gap-5">
          <ActivityMeter data={activity} />
          <div
            className={`hidden font-mono text-[10px] tabular-nums lg:block ${flip.deviceInfo && (flip.deviceInfo.overflowDelta || flip.deviceInfo.outOfRange) ? "text-alert" : "text-dim"}`}
            title="OOR: lecturas fuera de rango · OVF: pérdidas por desbordamiento del Flipper"
          >
            OOR {flip.deviceInfo ? flip.deviceInfo.outOfRange.toLocaleString("es-ES") : "—"} · OVF {flip.deviceInfo ? flip.deviceInfo.overflow.toLocaleString("es-ES") : "—"}
            {flip.deviceInfo?.overflowDelta !== null && flip.deviceInfo?.overflowDelta !== undefined
              ? ` · captura +${flip.deviceInfo.overflowDelta.toLocaleString("es-ES")}`
              : ""}
          </div>
          <div className="hidden items-center gap-4 font-mono text-[11px] lg:flex">
            <div className="flex items-center gap-1.5" title="Bytes recibidos">
              <span key={`rx${rxPulse}`} className={rxPulse ? "led led-mint led-flash" : "led led-off"} />
              <span className="text-dim">RX</span>
              <span className="w-16 text-right tabular-nums text-mint">{fmtBytes(counters.rx)}</span>
            </div>
            <div className="flex items-center gap-1.5" title="Bytes enviados">
              <span key={`tx${txPulse}`} className={txPulse ? "led led-ember led-flash" : "led led-off"} />
              <span className="text-dim">TX</span>
              <span className="w-16 text-right tabular-nums text-ember">{fmtBytes(counters.tx)}</span>
            </div>
          </div>
          <StatusPill status={status} label={portLabel(portInfo)} />
          <button
            onClick={() => setHelpOpen(true)}
            className="rounded border border-line bg-[#0c1930] px-3.5 py-2 font-display text-[11px] font-bold tracking-[0.16em] text-fog transition-colors hover:border-ember/50 hover:text-ember"
          >
            ? AYUDA
          </button>
        </div>
      </header>

      {/* aviso de compatibilidad */}
      {(!supported || !secure) && (
        <div className="flex items-center gap-2 border-b border-alert/30 bg-alert/10 px-4 py-1.5 font-mono text-[11px] text-[#ffb3b3]">
          <IconAlert className="h-3.5 w-3.5 shrink-0" />
          {!supported
            ? "Web Serial no disponible: necesitas Chrome o Edge de escritorio para hablar con el puerto COM."
            : "Contexto no seguro: la Web Serial API solo funciona por HTTPS o localhost (npm run dev / npm run preview)."}
        </div>
      )}

      {/* cuerpo */}
      <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 lg:flex-row">
        {/* zona principal */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {tab === "test" ? (
            <FlipperLab
              flip={flip}
              serialOpen={status === "open"}
              canMoveToAngle={status === "open" && !move.running && !axisTest.running && !extendedTest.running && !auto.running}
              onMoveToAngle={(angle) => void moveToCapturedAngle(angle)}
            />
          ) : tab === "montura" && serialTarget === "flipper" ? (
            <FlipperSerialConsole flip={flip} view="monitor" />
          ) : (
            <section
              className="brackets rise relative flex h-[56dvh] min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_34px_rgba(0,0,0,0.4)] lg:h-auto"
              style={{ animationDelay: "30ms" }}
            >
              <div className="flex shrink-0 items-center gap-2 border-b border-line bg-[#0a1424] px-3 py-2">
                <IconTerminal className="h-4 w-4 shrink-0 text-ember" />
                <span className="font-display text-[11px] font-bold tracking-[0.24em] text-fog">MONITOR SERIE</span>
                <span className="rounded border border-line px-1.5 py-px font-mono text-[10px] text-dim">
                  {entries.length} lín
                </span>
                <div className="ml-auto flex items-center gap-1.5">
                  <div className="flex overflow-hidden rounded border border-line">
                    {(["ascii", "hex", "mix"] as DisplayMode[]).map((m) => (
                      <button
                        key={m}
                        onClick={() => setDisplayMode(m)}
                        className={`px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                          displayMode === m ? "bg-ember/15 text-ember" : "text-dim hover:bg-white/[0.03] hover:text-fog"
                        }`}
                      >
                        {m === "mix" ? "ambos" : m}
                      </button>
                    ))}
                  </div>
                  <ToolBtn
                    title={autoscroll ? "Desactivar autoscroll" : "Activar autoscroll"}
                    onClick={() => setAutoscroll((a) => !a)}
                    active={autoscroll}
                  >
                    <IconScroll className="h-3.5 w-3.5" />
                  </ToolBtn>
                  <ToolBtn title="Limpiar monitor" onClick={clearLog}>
                    <IconTrash className="h-3.5 w-3.5" />
                  </ToolBtn>
                  <ToolBtn title="Exportar registro (.txt)" onClick={exportLog}>
                    <IconDownload className="h-3.5 w-3.5" />
                  </ToolBtn>
                </div>
              </div>

              <TerminalLog entries={entries} mode={displayMode} autoscroll={autoscroll} ready={apiOk && secure} />

              <CommandBar
                ref={barRef}
                value={cmd}
                onChange={setCmd}
                disabled={status !== "open"}
                onSend={(c) => void sendRaw(c)}
                termination={termination}
                onTermination={setTermination}
                history={history}
              />
            </section>
          )}
        </div>

        {/* divisor redimensionable */}
        <div
          onPointerDown={onDividerDown}
          onPointerMove={onDividerMove}
          onPointerUp={onDividerUp}
          onPointerCancel={onDividerUp}
          title="Arrastra para ajustar el ancho del panel"
          className="group hidden w-2 shrink-0 cursor-col-resize items-center justify-center lg:flex"
        >
          <div className="h-full w-[3px] rounded-full bg-line transition-colors group-hover:bg-ember/60 group-active:bg-ember" />
        </div>

        {/* panel lateral con pestañas */}
        <div className="side-col flex min-h-0 shrink-0 flex-col" style={sideStyle}>
          <RightPanel
            tab={tab}
            onTab={setTab}
            serialTarget={serialTarget}
            onSerialTarget={setSerialTarget}
            supported={supported && secure}
            status={status}
            settings={settings}
            onSettings={setSettings}
            portInfo={portInfo}
            authorized={serial.authorized}
            onOpenAuthorized={(p) => void handleOpenAuthorized(p)}
            onConnect={() => void handleConnect()}
            onDisconnect={() => void handleClose()}
            onQuick={handleQuick}
            decoded={decoded}
            profile={profile}
            auto={auto}
            onRunDiag={() => void runDiag()}
            onCancelDiag={cancelDiag}
            inputs={mvInputs}
            onInputs={(patch) => setMvInputs((v) => ({ ...v, ...patch }))}
            move={move}
            onStartMove={() => void runMove()}
            onStopMove={stopMove}
            onInitHome={() => void initHome()}
            jogAxis={jogAxis}
            onStartJog={(axis, dir) => void startJog(axis, dir)}
            onStopJog={stopJog}
            flip={flip}
            axisTestInputs={axisTestInputs}
            onAxisTestInputs={(patch) => {
              setAxisTestInputs((value) => ({ ...value, ...patch }));
              if (patch.revolutions !== undefined) {
                const revs = Number(patch.revolutions.replace(",", "."));
                if (Number.isFinite(revs)) {
                  setAxisTest((state) => ({ ...state, targetDeg: Math.max(0, revs * 360) }));
                }
              }
            }}
            axisTest={axisTest}
            extendedTest={extendedTest}
            onStartAxisTest={() => void startAxisTest(axisTestInputs, false)}
            onStartExtendedTest={() => void startExtendedAxisTest()}
            onStopAxisTest={stopAxisTest}
          />
        </div>
      </main>

      {/* barra de estado */}
      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-line bg-[#0a1424] px-4 font-mono text-[10.5px] text-dim">
        <span className="tabular-nums text-ion/80">UT {utc}</span>
        <span className="hidden tabular-nums sm:inline">AR {axisPosition.ar !== undefined && profile.cpr1 ? `${((axisPosition.ar * 360) / profile.cpr1).toFixed(3)}°` : "—"} · DEC {axisPosition.dec !== undefined && profile.cpr2 ? `${((axisPosition.dec * 360) / profile.cpr2).toFixed(3)}°` : "—"}</span>
        <a className="ml-auto text-dim transition-colors hover:text-ion" href="https://github.com/PablodlFuente/" target="_blank" rel="noreferrer">Pablo de la Fuente · GitHub</a>
      </footer>
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
