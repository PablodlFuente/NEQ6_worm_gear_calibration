/* Protocolo MC de SkyWatcher (NEQ6) — comandos, decodificación y datos */

export const POS_OFFSET = 0x800000;
/** Umbral para desenvolver diferencias entre posiciones firmadas de 24 bits. */
export const MAX_POSITION_DELTA = 0x7fffff;
/** Máximo recorrido modular que cabe en un objetivo GOTO de 24 bits. */
export const MAX_GOTO_STEPS = 0xffffff;
/**
 * Máximo incremento seguro al usar un destino absoluto :S. Por encima de
 * media escala, el mismo destino modular representa un recorrido más corto
 * en el sentido opuesto (una vuelta EQ6 acabaría en ~309°).
 */
export const MAX_SAFE_ABSOLUTE_GOTO_DELTA = 0x7fffff;
/** Límite aplicado por la implementación de referencia de SkyWatcher/INDI. */
export const MIN_T1_TICKS = 6;
/** Umbral de INDI: recorrido equivalente a 5 s a 128x velocidad sideral. */
export const SIDEREAL_DAY_SECONDS = 86164.09065;

export function lowSpeedGotoMarginSteps(cpr: number): number {
  return Math.round((640 * cpr) / SIDEREAL_DAY_SECONDS);
}

/** Escrituras con riesgo persistente o que alteran la referencia de posición. */
export function requiresDangerConfirmation(command: string): boolean {
  return /^:(?:Q|E|W)/.test(command.trim());
}

export interface MotionTiming {
  t1: number;
  realDegPerSec: number;
  maxDegPerSec: number;
  limited: boolean;
}

/**
 * Cuantiza una velocidad solicitada al periodo entero T1 que acepta la montura.
 * La velocidad devuelta es la programada realmente, no una medida de feedback.
 */
export function calculateMotionTiming(timer: number, cpr: number, requestedDegPerSec: number): MotionTiming {
  const maxDegPerSec = (timer * 360) / (MIN_T1_TICKS * cpr);
  const rawT1 = (timer * 360) / (requestedDegPerSec * cpr);
  const t1 = Math.min(0xffffff, Math.max(MIN_T1_TICKS, Math.round(rawT1)));
  const realDegPerSec = (timer * 360) / (t1 * cpr);
  return {
    t1,
    realDegPerSec,
    maxDegPerSec,
    limited: requestedDegPerSec > maxDegPerSec + 1e-12,
  };
}

/* ── serialización little-endian (byte bajo primero) ────── */

/** "563412" -> 0x123456 (byte bajo primero) */
export function hexLE(hex: string): number {
  const h = hex.trim();
  let out = 0;
  for (let i = 0; i < h.length; i += 2) {
    out |= parseInt(h.slice(i, i + 2), 16) << (4 * i);
  }
  return out >>> 0;
}

/** 0x123456 -> "563412" */
export function le24(n: number): string {
  const v = n >>> 0;
  const b0 = (v & 0xff).toString(16).padStart(2, "0");
  const b1 = ((v >>> 8) & 0xff).toString(16).padStart(2, "0");
  const b2 = ((v >>> 16) & 0xff).toString(16).padStart(2, "0");
  return (b0 + b1 + b2).toUpperCase();
}

/** posición lógica -> campo de 6 hex para :S / :E (con offset 0x800000) */
export function posField(logical: number): string {
  return le24((logical + POS_OFFSET) >>> 0);
}

/** ":e1\r" -> { letter:"e", ch:"1", rest:"" } */
export function cmdParts(cmd: string): { letter: string; ch: string; rest: string } | null {
  const s = cmd.trim().replace(/^:/, "").replace(/\r?\n?$/, "");
  if (!s) return null;
  const letter = s[0];
  const m = /^[0-9]/.test(s[1] ?? "") ? 2 : 1;
  return { letter, ch: s.slice(1, m), rest: s.slice(m) };
}

/** "100" (3 dígitos = nibbles) o "010000" (6 = bytes) -> [b0,b1,b2] */
export function statusFromChars(s: string): [number, number, number] | null {
  const h = s.trim();
  if (/^[0-9A-Fa-f]{3}$/.test(h)) {
    return [parseInt(h[0], 16), parseInt(h[1], 16), parseInt(h[2], 16)];
  }
  if (/^[0-9A-Fa-f]{6}$/.test(h)) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return null;
}

/* ── decodificación de respuestas ───────────────────────── */

export interface Decoded {
  kind: "empty" | "error" | "status" | "value" | "version" | "unknown";
  raw: string;
  value?: number;
  logical?: number; /* posición sin offset */
  desc: string;
  bits?: string[];
}

export const ERROR_CODES: Record<string, string> = {
  "0": "comando desconocido",
  "1": "longitud incorrecta",
  "2": "el motor debe estar parado",
  "3": "carácter inválido",
  "4": "no inicializado (marca home con :F)",
  "5": "driver en sleep (despierta con :B)",
  "7": "entrenamiento PEC activo",
  "8": "no hay datos PEC válidos",
};

const POS_LETTERS = ["S", "E", "H", "M", "j", "h", "d", "m", "k"];

export function decodeResponse(cmdKey: string | null, line: string): Decoded | null {
  const s = line.trim();
  if (!s) return null;

  if (s.startsWith("!")) {
    const code = s.slice(1).trim();
    const clean = code.replace(/^0+/, "") || "0";
    return {
      kind: "error",
      raw: s,
      desc: ERROR_CODES[clean] ?? `código !${code} sin documentar`,
    };
  }
  if (!s.startsWith("=")) return { kind: "unknown", raw: s, desc: "respuesta sin «=»" };

  const hex = s.slice(1);
  if (hex === "") return { kind: "empty", raw: s, desc: "Aceptado (tipo A: «=» sin datos)." };

  const parts = cmdKey ? { letter: cmdKey[0], ch: cmdKey[1] } : null;
  const letter = parts?.letter ?? "";

  if (letter === "f") {
    const st = statusFromChars(hex);
    if (st) {
      const [b0, b1, b2] = st;
      const bit = (v: number, n: number) => (v >> n) & 1;
      return {
        kind: "status",
        value: (b0 | (b1 << 8) | (b2 << 16)) >>> 0,
        raw: hex,
        desc: "Estado del motor (3 bytes)",
        bits: [
          bit(b0, 0) ? "GOTO" : "tracking",
          bit(b0, 1) ? "CCW" : "CW",
          bit(b0, 2) ? "fast" : "slow",
          bit(b1, 0) ? "EN MARCHA" : "parado",
          bit(b1, 1) ? "bloqueado" : "normal",
          bit(b2, 0) ? "inicializado" : "SIN inicializar",
          bit(b2, 1) ? "level" : "—",
        ],
      };
    }
  }

  if (!/^[0-9A-Fa-f]+$/.test(hex)) {
    return { kind: "unknown", raw: s, desc: "Datos no hex (texto/versión)." };
  }

  const value = hexLE(hex);

  if (POS_LETTERS.includes(letter)) {
    const logical = value - POS_OFFSET;
    const signed = logical > 0x7fffff ? logical - 0x1000000 : logical;
    return {
      kind: "value",
      value,
      raw: hex,
      logical: signed,
      desc: "Posición del encoder (offset 0x800000 aplicado)",
    };
  }

  if (letter === "e") {
    return {
      kind: "version",
      value,
      raw: hex,
      desc: `Versión de placa ${hex.slice(0, 2)}.${hex.slice(2, 4)}${hex.length > 4 ? ` build ${hexLE(hex.slice(4, 6)).toString()}` : ""}`,
    };
  }

  const names: Record<string, string> = {
    a: "CPR (pasos por revolución)",
    b: "Frecuencia del timer T1",
    c: "Pasos de frenado",
    g: "Relación de alta velocidad",
    i: "Periodo T1 configurado",
    s: "Periodo PEC",
    D: "Periodo de tracking 1x",
    I: "Periodo T1 (escritura aceptada)",
    T: "Periodo GOTO (escritura aceptada)",
  };
  return {
    kind: "value",
    value,
    raw: hex,
    desc: names[letter] ?? `Valor hex (byte bajo primero)`,
  };
}

/* ── perfil detectado de la montura ─────────────────────── */
export interface MountProfile {
  fw?: string;
  cpr1?: number;
  cpr2?: number;
  timer?: number;
  ratio1?: number;
  ratio2?: number;
}

/* ── comandos rápidos ───────────────────────────────────── */
export interface QuickCmd {
  cmd: string;
  desc: string;
  danger?: boolean;
  insert?: boolean; /* se inserta en la barra para completar */
}

export interface QuickGroup {
  title: string;
  note?: string;
  items: QuickCmd[];
}

export const QUICK: QuickGroup[] = [
  {
    title: "Identificación",
    items: [
      { cmd: ":e1", desc: "versión placa AR" },
      { cmd: ":e2", desc: "versión placa DEC" },
      { cmd: ":a1", desc: "CPR AR (pasos/vuelta)" },
      { cmd: ":a2", desc: "CPR DEC" },
      { cmd: ":b1", desc: "frecuencia timer T1" },
      { cmd: ":g1", desc: "ratio alta velocidad AR" },
      { cmd: ":g2", desc: "ratio alta velocidad DEC" },
      { cmd: ":c1", desc: "pasos de frenado" },
      { cmd: ":D1", desc: "periodo tracking 1x" },
      { cmd: ":d1", desc: "encoder auxiliar / home" },
      { cmd: ":s1", desc: "periodo PEC" },
    ],
  },
  {
    title: "Estado y posición",
    items: [
      { cmd: ":f1", desc: "estado motor AR (bits)" },
      { cmd: ":f2", desc: "estado motor DEC" },
      { cmd: ":j1", desc: "posición actual AR" },
      { cmd: ":j2", desc: "posición actual DEC" },
      { cmd: ":h1", desc: "destino GOTO AR" },
      { cmd: ":i1", desc: "periodo T1 configurado" },
      { cmd: ":k1", desc: "incremento GOTO AR" },
    ],
  },
  {
    title: "Inicialización",
    note: "Tras encender, el encoder no tiene referencia: «!4» en :J se cura marcando home.",
    items: [
      { cmd: ":F1", desc: "marcar home AR (posición = referencia)" },
      { cmd: ":F2", desc: "marcar home DEC" },
    ],
  },
  {
    title: "Parada",
    items: [
      { cmd: ":K1", desc: "parada suave AR (desacelera)" },
      { cmd: ":K2", desc: "parada suave DEC" },
      { cmd: ":K3", desc: "parada suave ambos" },
      { cmd: ":L1", desc: "parada inmediata AR", danger: true },
      { cmd: ":L2", desc: "parada inmediata DEC", danger: true },
    ],
  },
  {
    title: "GOTO / tracking",
    note: "Verificado en fw 2.04: «:G» lleva 1 byte de modo (:G100 ✓, :G10000 → !1).",
    items: [
      { cmd: ":G100", desc: "modo GOTO · CW · normal (AR)" },
      { cmd: ":G101", desc: "modo GOTO · CCW (AR)" },
      { cmd: ":G200", desc: "modo GOTO (DEC)" },
      { cmd: ":S1", desc: "destino absoluto AR → completa 6 hex", insert: true },
      { cmd: ":S2", desc: "destino absoluto DEC → completa", insert: true },
      { cmd: ":H1", desc: "incremento GOTO AR → completa", insert: true },
      { cmd: ":I1", desc: "periodo T1 (tracking) AR → completa", insert: true },
      { cmd: ":T1", desc: "periodo GOTO largo AR → completa", insert: true },
      { cmd: ":J1", desc: "iniciar movimiento AR" },
      { cmd: ":J2", desc: "iniciar movimiento DEC" },
      { cmd: ":B1", desc: "sleep/wakeup driver AR" },
    ],
  },
  {
    title: "Zona roja",
    note: "Pueden dejar la placa inservible: no tocar sin saber exactamente qué hacen.",
    items: [
      { cmd: ":Q55AA", desc: "ENTRAR EN BOOTLOADER", danger: true },
      { cmd: ":E1", desc: "fijar posición AR (sin movimiento)", danger: true, insert: true },
      { cmd: ":W", desc: "escritura extendida (PEC/flash…)", danger: true, insert: true },
    ],
  },
];

/* secuencia de apertura recomendada (autodiagnóstico) */
export const DIAG_SEQUENCE = [
  ":e1",
  ":e2",
  ":a1",
  ":a2",
  ":b1",
  ":g1",
  ":g2",
  ":c1",
  ":s1",
  ":d1",
  ":f1",
  ":f2",
  ":j1",
  ":j2",
];
