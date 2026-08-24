/* Flipper Zero NEQ6 Current Logger — lado web
 * Configuración A: R_total 0.323 Ω · Vref 2.5 V · 12 bits · K = 1.0025189
 * El crudo NUNCA se modifica: todo procesado genera vistas derivadas. */

export const ADC_CAL_K = 1.0025189;
export const SHUNT_R_OHM = 0.323;
export const ADC_VREF = 2.5;
export const ADC_STEPS = 4096;
/* I(A) = raw × 2.5 × K / 4096 / 0.323 */
export const AMP_PER_RAW = (ADC_VREF * ADC_CAL_K) / ADC_STEPS / SHUNT_R_OHM;
export const MAX_CURRENT_A = 2.5;

export const adcToAmps = (raw: number) => raw * AMP_PER_RAW;

export interface Sample {
  tb: number; /* Date.now() del navegador al recibir */
  ts: number; /* timestamp µs del Flipper (ya desenvuelto) */
  adc: number;
}

export interface AnglePoint {
  tb: number;
  deg: number; /* 0–360 */
}

export interface Session {
  id: string;
  name: string;
  createdAt: number;
  rateHz: number;
  tb: number[];
  ts: number[];
  adc: number[];
  angleTb: number[];
  angleDeg: number[];
}

export const FLIPPER_COMMANDS = [
  { cmd: "START", desc: "inicia la adquisición a la RATE vigente" },
  { cmd: "STOP", desc: "detiene la adquisición" },
  { cmd: "RATE <hz>", desc: "fija la frecuencia (10–1000 Hz)" },
  { cmd: "SYNC", desc: "devuelve «SYNC <µs>» para sincronizar relojes" },
  { cmd: "INFO", desc: "versión, rate, captura, drops y overflow" },
] as const;

/* ── parser de tramas A5 5A ts(u32 LE) adc(u16 LE) ────── */
export class StreamParser {
  private buf: number[] = [];
  private line: string = "";
  private lastRaw: number | null = null;
  private abs: number = 0;

  feed(bytes: Uint8Array, tb: number): { samples: Sample[]; lines: string[] } {
    const samples: Sample[] = [];
    const lines: string[] = [];
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      this.buf.push(b);
      /* texto (respuestas OK/ERR/SYNC/INFO) */
      if (b >= 32 && b < 127) this.line += String.fromCharCode(b);
      else if (b === 0x0a || b === 0x0d) {
        if (this.line.trim()) lines.push(this.line.trim());
        this.line = "";
      }
      /* trama binaria */
      if (this.buf.length >= 2 && this.buf[this.buf.length - 2] === 0xa5 && b === 0x5a) {
        /* posible cabecera: esperamos 6 bytes más tras ella */
      }
      const n = this.buf.length;
      if (n >= 8 && this.buf[n - 8] === 0xa5 && this.buf[n - 7] === 0x5a) {
        const tsRaw =
          (this.buf[n - 6] |
            (this.buf[n - 5] << 8) |
            (this.buf[n - 4] << 16) |
            ((this.buf[n - 3] << 24) >>> 0)) >>>
          0;
        const adc = this.buf[n - 2] | (this.buf[n - 1] << 8);
        /* unwrap del contador u32 (desborda cada ~67 s) */
        if (this.lastRaw === null) {
          this.abs = tsRaw;
        } else {
          let d = tsRaw - this.lastRaw;
          if (d < -0x80000000) d += 0x100000000;
          else if (d > 0x80000000) d -= 0x100000000;
          this.abs += d;
        }
        this.lastRaw = tsRaw;
        samples.push({ tb, ts: this.abs, adc });
        this.buf.length = 0;
      } else if (n > 16) {
        this.buf.shift(); /* resincronizar si hay ruido */
      }
    }
    return { samples, lines };
  }
}

/* ── estadística básica ───────────────────────────────── */
export const mean = (a: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i];
  return a.length ? s / a.length : 0;
};

export function median(a: ArrayLike<number>): number {
  if (!a.length) return 0;
  const s = [...Array.from(a)].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function std(a: ArrayLike<number>): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - m) ** 2;
  return Math.sqrt(s / (a.length - 1));
}

/* estadística circular para ángulos (0–360) */
export function circularStats(angles: number[]): { meanDeg: number; R: number; stdDeg: number } {
  let sx = 0;
  let sy = 0;
  for (const a of angles) {
    const r = (a * Math.PI) / 180;
    sx += Math.cos(r);
    sy += Math.sin(r);
  }
  const n = angles.length || 1;
  sx /= n;
  sy /= n;
  const R = Math.hypot(sx, sy);
  const meanDeg = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const Rc = Math.min(R, 0.999999);
  const stdDeg = Math.sqrt(-2 * Math.log(Rc)) * (180 / Math.PI);
  return { meanDeg, R, stdDeg: isFinite(stdDeg) ? stdDeg : 360 };
}

/* ── ángulos: unwrap + interpolación temporal ─────────── */
export function unwrapDegrees(pts: AnglePoint[]): AnglePoint[] {
  if (pts.length < 2) return [...pts];
  const out: AnglePoint[] = [{ ...pts[0] }];
  let acc = pts[0].deg;
  for (let i = 1; i < pts.length; i++) {
    let d = pts[i].deg - pts[i - 1].deg;
    if (d > 180) d -= 360;
    else if (d < -180) d += 360;
    acc += d;
    out.push({ tb: pts[i].tb, deg: acc });
  }
  return out;
}

export function angleAt(unw: AnglePoint[], tb: number): number | null {
  if (unw.length < 2) return null;
  if (tb < unw[0].tb || tb > unw[unw.length - 1].tb) return null;
  let lo = 0;
  let hi = unw.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (unw[m].tb <= tb) lo = m;
    else hi = m;
  }
  const a = unw[lo];
  const b = unw[hi];
  const f = (tb - a.tb) / (b.tb - a.tb || 1);
  return a.deg + f * (b.deg - a.deg);
}

export function resampleUniform(ts: number[], vals: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n);
  const t0 = ts[0];
  const t1 = ts[ts.length - 1];
  if (t1 <= t0) return out;
  let j = 0;
  for (let i = 0; i < n; i++) {
    const t = t0 + ((t1 - t0) * i) / (n - 1);
    while (j < ts.length - 2 && ts[j + 1] < t) j++;
    const f = (t - ts[j]) / (ts[j + 1] - ts[j] || 1);
    out[i] = vals[j] + f * (vals[j + 1] - vals[j]);
  }
  return out;
}

/* ── FFT radix-2 + picos ──────────────────────────────── */
export function fftMag(input: Float64Array): Float64Array {
  let n = 1;
  while (n < input.length) n <<= 1;
  n = Math.min(n, 8192);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const m = Math.min(input.length, n);
  /* ventana de Hann para reducir fugas */
  for (let i = 0; i < m; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1 || 1));
    re[i] = input[i] * w;
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let j = 0; j < len / 2; j++) {
        const ur = re[i + j];
        const ui = im[i + j];
        const vr = re[i + j + len / 2] * cr - im[i + j + len / 2] * ci;
        const vi = re[i + j + len / 2] * ci + im[i + j + len / 2] * cr;
        re[i + j] = ur + vr;
        im[i + j] = ui + vi;
        re[i + j + len / 2] = ur - vr;
        im[i + j + len / 2] = ui - vi;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

export function topPeaks(
  mag: Float64Array,
  df: number,
  k: number,
): { bin: number; freq: number; period: number; mag: number }[] {
  const peaks: { bin: number; freq: number; period: number; mag: number }[] = [];
  for (let i = 2; i < mag.length - 1; i++) {
    if (mag[i] > mag[i - 1] && mag[i] >= mag[i + 1] && mag[i] > 0) {
      peaks.push({ bin: i, freq: i * df, period: 1 / (i * df || 1e-9), mag: mag[i] });
    }
  }
  peaks.sort((a, b) => b.mag - a.mag);
  return peaks.slice(0, k);
}

/* ── binning por ángulo (0–360°) ──────────────────────── */
export interface AngleBin {
  angle: number;
  mean: number;
  err: number;
  n: number;
}

export function binPolar(angles: number[], currents: number[], bins = 72): AngleBin[] {
  const acc: { s: number; n: number }[] = Array.from({ length: bins }, () => ({ s: 0, n: 0 }));
  for (let i = 0; i < angles.length; i++) {
    const a = ((angles[i] % 360) + 360) % 360;
    const b = Math.min(bins - 1, Math.floor((a / 360) * bins));
    acc[b].s += currents[i];
    acc[b].n++;
  }
  return acc.map((g, i) => ({
    angle: ((i + 0.5) * 360) / bins,
    mean: g.n ? g.s / g.n : NaN,
    err: 0,
    n: g.n,
  }));
}

export function binCartesian(angles: number[], currents: number[], bins = 72): AngleBin[] {
  const groups: number[][] = Array.from({ length: bins }, () => []);
  for (let i = 0; i < angles.length; i++) {
    const a = ((angles[i] % 360) + 360) % 360;
    const b = Math.min(bins - 1, Math.floor((a / 360) * bins));
    groups[b].push(currents[i]);
  }
  return groups.map((g, i) => {
    const m = g.length ? mean(g) : NaN;
    const sd = g.length > 1 ? std(g) : 0;
    return {
      angle: ((i + 0.5) * 360) / bins,
      mean: m,
      err: g.length > 1 ? sd / Math.sqrt(g.length) : 0, /* σ/√n */
      n: g.length,
    };
  });
}

/* ── CSV (crudo y procesado) ──────────────────────────── */
export function buildRawCsv(samples: Sample[], rate: number): string {
  const head = `# neq6-logger raw · rate=${rate}Hz · I(A)=adc*${AMP_PER_RAW.toFixed(9)}\nts_us,adc_raw,tb_ms\n`;
  const rows = samples.map((s) => `${s.ts},${s.adc},${s.tb}`);
  return head + rows.join("\n") + "\n";
}

export function buildProcCsv(
  rows: (Sample & { amps: number; unw: number | null; rev: number | null })[],
  rate: number,
  statsTxt: string[],
): string {
  const head =
    `# neq6-logger procesado · rate=${rate}Hz\n` +
    statsTxt.map((s) => `# ${s}\n`).join("") +
    "ts_us,adc_raw,amps,angle_unwrapped_deg,rev,tb_ms\n";
  const body = rows.map(
    (r) =>
      `${r.ts},${r.adc},${r.amps.toFixed(6)},${r.unw === null ? "" : r.unw.toFixed(4)},${
        r.rev === null ? "" : r.rev
      },${r.tb}`,
  );
  return head + body.join("\n") + "\n";
}

export function parseCsv(text: string): { samples: Sample[]; processed: boolean } | null {
  const lines = text.split(/\r?\n/).filter((l) => l.length && !l.startsWith("#"));
  if (!lines.length) return null;
  const head = lines[0].toLowerCase().split(",");
  const iTs = head.indexOf("ts_us");
  const iAdc = head.indexOf("adc_raw");
  const iTb = head.indexOf("tb_ms");
  if (iTs < 0 || iAdc < 0) return null;
  const processed = head.includes("amps");
  const samples: Sample[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const ts = Number(c[iTs]);
    let adc = Number(c[iAdc]);
    if (!isFinite(ts) || !isFinite(adc)) continue;
    if (processed && !Number.isInteger(adc)) {
      /* el procesado conserva adc_raw entero; si viniera en amps, revertir */
      const amps = Number(c[head.indexOf("amps")]);
      if (isFinite(amps)) adc = Math.round(amps / AMP_PER_RAW);
    }
    samples.push({ ts, adc: Math.round(adc), tb: iTb >= 0 ? Number(c[iTb]) || 0 : 0 });
  }
  return samples.length ? { samples, processed } : null;
}

/* ── IndexedDB (sesiones) ─────────────────────────────── */
const DB_NAME = "neq6-flipper-sessions";
const STORE = "sessions";

function dbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const idb = {
  async save(s: Session): Promise<void> {
    const db = await dbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(s);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
  async list(): Promise<Session[]> {
    const db = await dbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => res((req.result as Session[]).sort((a, b) => b.createdAt - a.createdAt));
      req.onerror = () => rej(req.error);
    });
  },
  async remove(id: string): Promise<void> {
    const db = await dbOpen();
    return new Promise((res, rej) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  },
};
