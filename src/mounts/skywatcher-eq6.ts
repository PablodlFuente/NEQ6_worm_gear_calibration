import {
  calculateMotionTiming,
  decodeResponse,
  requiresDangerConfirmation,
  type QuickGroup,
} from "../lib/protocol";
import type { MountDriver } from "./types";

const QUICK_COMMANDS: QuickGroup[] = [
  {
    title: "Identificación",
    items: [
      { cmd: ":e1", desc: "versión placa AR" }, { cmd: ":e2", desc: "versión placa DEC" },
      { cmd: ":a1", desc: "CPR AR (pasos/vuelta)" }, { cmd: ":a2", desc: "CPR DEC" },
      { cmd: ":b1", desc: "frecuencia timer T1" }, { cmd: ":g1", desc: "ratio alta velocidad AR" },
      { cmd: ":g2", desc: "ratio alta velocidad DEC" }, { cmd: ":c1", desc: "pasos de frenado" },
      { cmd: ":D1", desc: "periodo tracking 1x" }, { cmd: ":d1", desc: "encoder auxiliar / home" },
      { cmd: ":s1", desc: "periodo PEC" },
    ],
  },
  {
    title: "Estado y posición",
    items: [
      { cmd: ":f1", desc: "estado motor AR (bits)" }, { cmd: ":f2", desc: "estado motor DEC" },
      { cmd: ":j1", desc: "posición actual AR" }, { cmd: ":j2", desc: "posición actual DEC" },
      { cmd: ":h1", desc: "destino GOTO AR" }, { cmd: ":i1", desc: "periodo T1 configurado" },
      { cmd: ":k1", desc: "incremento GOTO AR" },
    ],
  },
  {
    title: "Inicialización",
    note: "Tras encender, el encoder no tiene referencia: «!4» en :J se cura marcando home.",
    items: [{ cmd: ":F1", desc: "marcar home AR (posición = referencia)" }, { cmd: ":F2", desc: "marcar home DEC" }],
  },
  {
    title: "Parada",
    items: [
      { cmd: ":K1", desc: "parada suave AR (desacelera)" }, { cmd: ":K2", desc: "parada suave DEC" },
      { cmd: ":K3", desc: "parada suave ambos" }, { cmd: ":L1", desc: "parada inmediata AR", danger: true },
      { cmd: ":L2", desc: "parada inmediata DEC", danger: true },
    ],
  },
  {
    title: "GOTO / tracking",
    note: "Verificado en fw 2.04: «:G» lleva 1 byte de modo (:G100 ✓, :G10000 → !1).",
    items: [
      { cmd: ":G100", desc: "GOTO rápido · CW (AR)" }, { cmd: ":G101", desc: "GOTO rápido · CCW (AR)" },
      { cmd: ":G120", desc: "GOTO lento · CW (AR)" }, { cmd: ":G110", desc: "velocidad continua lenta · CW (AR)" },
      { cmd: ":G130", desc: "velocidad continua rápida · CW (AR)" }, { cmd: ":G200", desc: "modo GOTO (DEC)" },
      { cmd: ":S1", desc: "destino absoluto AR → completa 6 hex", insert: true },
      { cmd: ":S2", desc: "destino absoluto DEC → completa", insert: true },
      { cmd: ":H1", desc: "incremento GOTO AR → completa", insert: true },
      { cmd: ":I1", desc: "periodo T1 (tracking) AR → completa", insert: true },
      { cmd: ":T1", desc: "periodo GOTO largo AR → completa", insert: true },
      { cmd: ":J1", desc: "iniciar movimiento AR" }, { cmd: ":J2", desc: "iniciar movimiento DEC" },
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

const DIAGNOSTIC_SEQUENCE = [
  ":e1", ":e2", ":a1", ":a2", ":b1", ":g1", ":g2", ":c1", ":s1", ":d1", ":f1", ":f2", ":j1", ":j2",
];

export const skyWatcherEq6Driver: MountDriver = {
  id: "skywatcher-eq6-mc",
  manufacturer: "Sky-Watcher",
  model: "EQ6 / NEQ6 MC",
  protocolName: "SkyWatcher MC / EQDirect",
  serial: { baudRate: 9600, dataBits: 8, stopBits: 1, parity: "none" },
  quickCommands: QUICK_COMMANDS,
  diagnosticSequence: DIAGNOSTIC_SEQUENCE,
  decodeResponse,
  requiresDangerConfirmation,
  calculateMotionTiming,
  emptyProfile: () => ({}),
};
