/* Utilidades serie + datos de configuración de la NEQ6 */

export interface QuickCommand {
  cmd: string;
  desc: string;
  danger?: boolean;
}

export const BAUD_RATES = [4800, 9600, 19200, 38400, 57600, 115200];

export interface Termination {
  id: string;
  label: string;
  value: string;
}

export const TERMINATIONS: Termination[] = [
  { id: "cr", label: "CR (\\r)", value: "\r" },
  { id: "lf", label: "LF (\\n)", value: "\n" },
  { id: "crlf", label: "CRLF", value: "\r\n" },
  { id: "none", label: "sin final", value: "" },
];

export const VID_NAMES: Record<number, string> = {
  0x1a86: "QinHeng CH340",
  0x0403: "FTDI",
  0x10c4: "Silicon Labs CP210x",
  0x067b: "Prolific PL2303",
  0x2341: "Arduino",
  0x2e8a: "Raspberry Pi",
  0x1b4f: "SparkFun",
  0x0d28: "NXP mbed",
};

/* ── utilidades ─────────────────────────────────────────── */

export const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");

export const hex4 = (n: number) => "0x" + n.toString(16).toUpperCase().padStart(4, "0");

export const hexBytes = (bytes: ArrayLike<number>) => {
  const out: string[] = [];
  for (let i = 0; i < bytes.length; i++) out.push(hex2(bytes[i]));
  return out.join(" ");
};

export const asciiOf = (bytes: ArrayLike<number>) => {
  let s = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    s += b >= 32 && b <= 126 ? String.fromCharCode(b) : `[${hex2(b)}]`;
  }
  return s;
};

export function timeNow(): string {
  const d = new Date();
  return `${d.toTimeString().slice(0, 8)}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export const fmtBytes = (n: number) =>
  n < 1024
    ? `${n} B`
    : n < 1048576
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1048576).toFixed(2)} MB`;

export const fmtDuration = (s: number) =>
  `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

export const portLabel = (info?: SerialPortInfo) => {
  if (!info || (info.usbVendorId === undefined && info.usbProductId === undefined))
    return "Puerto serie";
  const name = info.usbVendorId !== undefined ? VID_NAMES[info.usbVendorId] : undefined;
  const vid = info.usbVendorId !== undefined ? hex4(info.usbVendorId) : "—";
  const pid = info.usbProductId !== undefined ? hex4(info.usbProductId) : "—";
  return name ? `${name} · ${vid}/${pid}` : `${vid}/${pid}`;
};
