/* Flipper Zero NEQ6 Current Logger — lado web
 * Configuración A: R_total 0.323 Ω · Vref 2.5 V · 12 bits · K = 1.0025189
 * El crudo NUNCA se modifica: todo procesado genera vistas derivadas. */

export const ADC_VREF = 2.5;
export const ADC_STEPS = 4096;
export const MAX_CURRENT_A = 2.5;

export interface AdcCalibration {
  shuntOhm: number;
  k: number;
}

export const DEFAULT_ADC_CALIBRATION: AdcCalibration = { shuntOhm: 0.323, k: 1.0025189 };
export const ADC_CAL_K = DEFAULT_ADC_CALIBRATION.k;
export const SHUNT_R_OHM = DEFAULT_ADC_CALIBRATION.shuntOhm;
export const ampsPerRaw = (calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION) =>
  (ADC_VREF * calibration.k) / ADC_STEPS / calibration.shuntOhm;
export const AMP_PER_RAW = ampsPerRaw();

export const adcToAmps = (raw: number, calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION) =>
  raw * ampsPerRaw(calibration);

export interface Sample {
  tb: number; /* Date.now() del navegador al recibir */
  ts: number; /* timestamp µs del Flipper (ya desenvuelto) */
  adc: number;
}

export interface AnglePoint {
  tb: number;
  deg: number; /* 0–360 */
}

export interface CaptureMetadata {
  axis: 1 | 2 | null;
  direction: "cw" | "ccw" | null;
  originSteps: number | null;
}

export interface ExtendedPeak {
  frequencyHz: number;
  periodMountDeg: number | null;
  magnitude: number;
}

export interface ExtendedPassStatistics {
  n: number;
  durationS: number;
  effectiveRateHz: number;
  meanA: number;
  medianA: number;
  sdA: number;
  semA: number;
  maxA: number;
  maxAngleDeg: number | null;
  angleSpanDeg: number;
  measuredSpeedDegS: number | null;
  samplesPerDeg: number | null;
  circularMeanDeg: number | null;
  circularR: number | null;
  circularStdDeg: number | null;
  ellipse: PolarEllipseFit | null;
}

export interface ExtendedAngularProfile {
  /** Centros de 360 sectores de un grado. */
  anglesDeg: number[];
  /** Media de corriente del sector; null si no hubo muestra posicionada. */
  currentA: (number | null)[];
}

export interface ExtendedAngularSamples {
  /** Ángulo desenvuelto del feedback de la montura para cada muestra posicionada. */
  anglesDeg: number[];
  /** Corriente calibrada correspondiente, sin promedio implícito. */
  currentA: number[];
}

export interface FftSpectrum {
  /** Separación entre bins del espectro. */
  dfHz: number;
  /** Magnitud, incluido el bin de continua. */
  magnitude: number[];
}

/** Promedia espectros con distinta resolución interpolándolos sobre el eje
 * común más prudente: el df más grueso y el menor Nyquist disponible. */
export function averageFftSpectra(spectra: FftSpectrum[]): FftSpectrum | null {
  const valid = spectra.filter((spectrum) => spectrum.dfHz > 0 && spectrum.magnitude.length > 2);
  if (!valid.length) return null;
  const dfHz = Math.max(...valid.map((spectrum) => spectrum.dfHz));
  const maxHz = Math.min(...valid.map((spectrum) => (spectrum.magnitude.length - 1) * spectrum.dfHz));
  const length = Math.floor(maxHz / dfHz) + 1;
  const magnitude = Array.from({ length }, (_, index) => {
    const hz = index * dfHz;
    let sum = 0;
    for (const spectrum of valid) {
      const position = hz / spectrum.dfHz;
      const left = Math.floor(position);
      const right = Math.min(spectrum.magnitude.length - 1, left + 1);
      const fraction = position - left;
      sum += spectrum.magnitude[left] * (1 - fraction) + spectrum.magnitude[right] * fraction;
    }
    return sum / valid.length;
  });
  return { dfHz, magnitude };
}

export interface ExtendedPassResult {
  id: string;
  label: string;
  direction: "cw" | "ccw" | "stationary";
  requestedSpeedDegS: number;
  measuredSpeedDegS: number | null;
  peaks: ExtendedPeak[];
  statistics: ExtendedPassStatistics;
  /** Espectro completo de la pasada, no sólo sus picos principales. */
  spectrum?: FftSpectrum;
  /** Espectros separados de cada revolución completa disponible. */
  revolutionSpectra?: FftSpectrum[];
  /** Datos nuevos: bloque × se aplica dinámicamente en la interfaz. */
  samples: ExtendedAngularSamples;
  /** Compatibilidad con sesiones creadas por versiones anteriores. */
  profile?: ExtendedAngularProfile;
}

export interface ExtendedPeakGroup {
  id: string;
  classification: "mecánica" | "tren motor" | "eléctrica/muestreo" | "incierta";
  representativeHz: number;
  representativeDeg: number | null;
  passes: string[];
  harmonicOfHz: number | null;
  reason: string;
}

export interface ExtendedAnalysis {
  createdAt: number;
  passes: ExtendedPassResult[];
  groups: ExtendedPeakGroup[];
}

const relativeDifference = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b), 1e-12);

/** Clasificación comparativa; es evidencia experimental, no identificación
 * automática de una pieza concreta. */
export function classifyExtendedPeaks(
  passes: Array<Pick<ExtendedPassResult, "id" | "label" | "direction" | "requestedSpeedDegS" | "measuredSpeedDegS" | "peaks">>,
): ExtendedPeakGroup[] {
  const observations = passes.flatMap((pass) => pass.peaks.map((peak) => ({ pass, peak })));
  const used = new Set<number>();
  const groups: ExtendedPeakGroup[] = [];
  for (let i = 0; i < observations.length; i++) {
    if (used.has(i)) continue;
    const members = [observations[i]];
    used.add(i);
    for (let j = i + 1; j < observations.length; j++) {
      if (used.has(j)) continue;
      const a = observations[i];
      const b = observations[j];
      if (a.pass.id === b.pass.id) continue;
      const sameHz = relativeDifference(a.peak.frequencyHz, b.peak.frequencyHz) <= 0.05;
      const sameDeg = a.peak.periodMountDeg !== null && b.peak.periodMountDeg !== null &&
        relativeDifference(a.peak.periodMountDeg, b.peak.periodMountDeg) <= 0.08;
      if (sameHz || sameDeg) {
        members.push(b);
        used.add(j);
      }
    }
    const differentSpeeds = members.some((a) => members.some((b) =>
      a.pass.id !== b.pass.id && relativeDifference(a.pass.requestedSpeedDegS, b.pass.requestedSpeedDegS) >= 0.2));
    const degreeStable = differentSpeeds && members.some((a) => members.some((b) =>
      a.pass.id !== b.pass.id && a.peak.periodMountDeg !== null && b.peak.periodMountDeg !== null &&
      relativeDifference(a.peak.periodMountDeg, b.peak.periodMountDeg) <= 0.08));
    const hzStable = differentSpeeds && members.some((a) => members.some((b) =>
      a.pass.id !== b.pass.id && relativeDifference(a.peak.frequencyHz, b.peak.frequencyHz) <= 0.05));
    const stationaryPresent = members.some((member) => member.pass.direction === "stationary");
    const motionDirections = new Set(members.map((member) => member.pass.direction).filter((direction) => direction !== "stationary"));
    const bothDirections = motionDirections.size > 1;
    const classification = stationaryPresent
      ? "eléctrica/muestreo"
      : degreeStable
      ? bothDirections ? "mecánica" : "tren motor"
      : hzStable ? "eléctrica/muestreo" : "incierta";
    const representativeHz = median(members.map((member) => member.peak.frequencyHz));
    const degreeValues = members.map((member) => member.peak.periodMountDeg).filter((value): value is number => value !== null);
    let harmonicOfHz: number | null = null;
    for (const candidate of observations) {
      if (candidate.peak.frequencyHz >= representativeHz) continue;
      const ratio = representativeHz / candidate.peak.frequencyHz;
      const integer = Math.round(ratio);
      if (integer >= 2 && integer <= 5 && Math.abs(ratio - integer) <= 0.04) {
        harmonicOfHz = candidate.peak.frequencyHz;
        break;
      }
    }
    groups.push({
      id: `X${groups.length + 1}`,
      classification,
      representativeHz,
      representativeDeg: degreeValues.length ? median(degreeValues) : null,
      passes: [...new Set(members.map((member) => member.pass.label))],
      harmonicOfHz,
      reason: stationaryPresent
        ? "Presente también con los motores parados: origen eléctrico, del ADC o del transporte."
        : degreeStable
        ? bothDirections
          ? "Periodo angular estable entre velocidades y presente en ambos sentidos."
          : "La frecuencia escala con la velocidad; falta confirmación en ambos sentidos."
        : hzStable
          ? "Frecuencia temporal estable aunque cambia la velocidad."
          : "Sin coincidencia suficiente entre velocidades/sentidos.",
    });
  }
  const rank = { "mecánica": 0, "tren motor": 1, "eléctrica/muestreo": 2, "incierta": 3 } as const;
  return groups.sort((a, b) => rank[a.classification] - rank[b.classification] || a.representativeHz - b.representativeHz);
}

export const EMPTY_CAPTURE_METADATA: CaptureMetadata = {
  axis: null,
  direction: null,
  originSteps: null,
};

export function capturedAngleDeltaDeg(
  currentSteps: number,
  cpr: number,
  metadata: CaptureMetadata,
  angleDeg: number,
): number | null {
  if (!cpr || metadata.originSteps === null || metadata.direction === null) return null;
  const normalized = ((angleDeg % 360) + 360) % 360;
  const sign = metadata.direction === "cw" ? 1 : -1;
  /* La fase del gráfico pertenece a la revolución capturada: 210° no es
   * intercambiable por -150°. No se normaliza al camino más corto porque
   * eso cambia el sentido de aproximación y deja el punto en otra rama de
   * holgura. El destino se calcula desde el feedback :j que fijó el origen. */
  const target = metadata.originSteps + sign * (normalized * cpr) / 360;
  return ((target - currentSteps) * 360) / cpr;
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
  metadata?: CaptureMetadata;
  calibration?: AdcCalibration;
  extendedAnalysis?: ExtendedAnalysis | null;
  extendedFiles?: { name: string; data: string }[];
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

  reset() {
    this.buf = [];
    this.line = "";
    this.lastRaw = null;
    this.abs = 0;
  }

  feed(bytes: Uint8Array, tb: number): { samples: Sample[]; lines: string[] } {
    const samples: Sample[] = [];
    const lines: string[] = [];
    this.buf.push(...bytes);

    /*
     * El flujo multiplexa líneas ASCII y tramas binarias. Es importante no
     * interpretar el payload de una trama como texto: timestamps y ADC pueden
     * contener por casualidad CR/LF o caracteres imprimibles y contaminar la
     * siguiente respuesta OK/SYNC.
     */
    while (this.buf.length) {
      if (this.buf[0] === 0xa5) {
        if (this.buf.length === 1) break; /* cabecera partida entre paquetes */
        if (this.buf[1] === 0x5a) {
          if (this.buf.length < 8) break;
          const frame = this.buf.splice(0, 8);
          const tsRaw =
            (frame[2] |
              (frame[3] << 8) |
              (frame[4] << 16) |
              ((frame[5] << 24) >>> 0)) >>>
          0;
          const adc = frame[6] | (frame[7] << 8);
          /* unwrap del timestamp u32 en microsegundos (~71,6 min) */
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
          continue;
        }
      }

      const b = this.buf.shift()!;
      if (b === 0x0a || b === 0x0d) {
        if (this.line.trim()) lines.push(this.line.trim());
        this.line = "";
      } else if (b >= 32 && b < 127) {
        this.line += String.fromCharCode(b);
        if (this.line.length > 160) this.line = this.line.slice(-160);
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
export function circularStats(angles: number[], weights?: ArrayLike<number>): { meanDeg: number; R: number; stdDeg: number } {
  let sx = 0;
  let sy = 0;
  let totalWeight = 0;
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    const weight = weights ? Math.max(0, Number(weights[i]) || 0) : 1;
    const r = (a * Math.PI) / 180;
    sx += Math.cos(r) * weight;
    sy += Math.sin(r) * weight;
    totalWeight += weight;
  }
  const denominator = totalWeight || 1;
  sx /= denominator;
  sy /= denominator;
  const R = Math.hypot(sx, sy);
  const meanDeg = ((Math.atan2(sy, sx) * 180) / Math.PI + 360) % 360;
  const Rc = Math.min(R, 0.999999);
  const stdDeg = Math.sqrt(-2 * Math.log(Rc)) * (180 / Math.PI);
  return { meanDeg, R, stdDeg: isFinite(stdDeg) ? stdDeg : 360 };
}

export interface PolarEllipseFit {
  centerX: number;
  centerY: number;
  semiMajor: number;
  semiMinor: number;
  angleDeg: number;
  eccentricity: number;
  rms: number;
}

/** Ajuste geométrico PCA de la nube polar convertida a coordenadas cartesianas. */
export function fitPolarEllipse(angles: ArrayLike<number>, radii: ArrayLike<number>): PolarEllipseFit | null {
  const n = Math.min(angles.length, radii.length);
  if (n < 12) return null;
  let cx = 0;
  let cy = 0;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = (angles[i] * Math.PI) / 180;
    xs[i] = Math.sin(a) * radii[i];
    ys[i] = -Math.cos(a) * radii[i];
    cx += xs[i];
    cy += ys[i];
  }
  cx /= n;
  cy /= n;
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - cx;
    const y = ys[i] - cy;
    xx += x * x;
    xy += x * y;
    yy += y * y;
  }
  xx /= n;
  xy /= n;
  yy /= n;
  const trace = xx + yy;
  const root = Math.sqrt(Math.max(0, (xx - yy) ** 2 + 4 * xy ** 2));
  const l1 = (trace + root) / 2;
  const l2 = (trace - root) / 2;
  if (!(l1 > 0) || !(l2 > 0)) return null;
  const semiMajor = Math.sqrt(2 * l1);
  const semiMinor = Math.sqrt(2 * l2);
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  let residual = 0;
  for (let i = 0; i < n; i++) {
    const x = xs[i] - cx;
    const y = ys[i] - cy;
    const u = x * ca + y * sa;
    const v = -x * sa + y * ca;
    residual += (Math.sqrt((u / semiMajor) ** 2 + (v / semiMinor) ** 2) - 1) ** 2;
  }
  return {
    centerX: cx,
    centerY: cy,
    semiMajor,
    semiMinor,
    angleDeg: ((angle * 180) / Math.PI + 180) % 180,
    eccentricity: Math.sqrt(Math.max(0, 1 - (semiMinor * semiMinor) / (semiMajor * semiMajor))),
    rms: Math.sqrt(residual / n),
  };
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

/** Elige una vez el offset temporal de la captura. Conserva SYNC si coincide
 * con la recepción y cae al ancla del primer lote si pertenece a otra vuelta
 * del contador u32 del Flipper (71,6 min). */
export function chooseSampleClockOffset(
  syncOffsetMs: number | null,
  sampleTsUs: number,
  receivedTbMs: number,
): number {
  const receivedOffset = sampleTsUs / 1000 - receivedTbMs;
  if (syncOffsetMs === null) return receivedOffset;
  const projectedTb = sampleTsUs / 1000 - syncOffsetMs;
  /* Una discrepancia tan grande no es latencia BLE: es otra vuelta del u32.
   * La elección se hace una vez con el primer lote y queda fija. */
  return Math.abs(projectedTb - receivedTbMs) > 5_000 ? receivedOffset : syncOffsetMs;
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

/* ── promedio secuencial corriente/ángulo ─────────────── */
export interface AveragedSeries {
  length: number;
  factor: number;
  ts: Float64Array;
  tb: Float64Array;
  adc: Float64Array;
  amps: Float64Array;
  ampsErr: Float64Array; /* error estándar de la media */
  angles: Float64Array; /* grados desenvueltos */
  angleErr: Float64Array; /* error estándar de la media */
  revs: Int32Array;
  counts: Uint16Array;
}

/** Agrupa en orden temporal bloques completos de N muestras que tienen ángulo.
 * Con N=1 se conserva cada dato. Para N>1 se devuelve media y SEM en corriente
 * y ángulo; el último bloque incompleto se deja fuera hasta completarse. */
export function averageAngleSeries(
  ts: ArrayLike<number>,
  tb: ArrayLike<number>,
  adc: ArrayLike<number>,
  amps: ArrayLike<number>,
  angles: ArrayLike<number>,
  factor: number,
): AveragedSeries | null {
  const m = Math.max(1, Math.floor(factor));
  let valid = 0;
  const size = Math.min(ts.length, tb.length, adc.length, amps.length, angles.length);
  for (let i = 0; i < size; i++) if (Number.isFinite(angles[i])) valid++;
  const groups = Math.floor(valid / m);
  if (!groups) return null;

  const out: AveragedSeries = {
    length: groups,
    factor: m,
    ts: new Float64Array(groups),
    tb: new Float64Array(groups),
    adc: new Float64Array(groups),
    amps: new Float64Array(groups),
    ampsErr: new Float64Array(groups),
    angles: new Float64Array(groups),
    angleErr: new Float64Array(groups),
    revs: new Int32Array(groups),
    counts: new Uint16Array(groups),
  };

  let group = 0;
  let count = 0;
  let sumTs = 0;
  let sumTb = 0;
  let sumAdc = 0;
  let sumA = 0;
  let sumA2 = 0;
  let sumAngle = 0;
  let sumAngle2 = 0;
  for (let i = 0; i < size && group < groups; i++) {
    const angle = angles[i];
    if (!Number.isFinite(angle)) continue;
    const current = amps[i];
    sumTs += ts[i];
    sumTb += tb[i];
    sumAdc += adc[i];
    sumA += current;
    sumA2 += current * current;
    sumAngle += angle;
    sumAngle2 += angle * angle;
    count++;
    if (count !== m) continue;

    const varianceA = m > 1 ? Math.max(0, (sumA2 - (sumA * sumA) / m) / (m - 1)) : 0;
    const varianceAngle =
      m > 1 ? Math.max(0, (sumAngle2 - (sumAngle * sumAngle) / m) / (m - 1)) : 0;
    out.ts[group] = sumTs / m;
    out.tb[group] = sumTb / m;
    out.adc[group] = sumAdc / m;
    out.amps[group] = sumA / m;
    out.ampsErr[group] = Math.sqrt(varianceA / m);
    out.angles[group] = sumAngle / m;
    out.angleErr[group] = Math.sqrt(varianceAngle / m);
    out.counts[group] = m;
    group++;
    count = 0;
    sumTs = sumTb = sumAdc = sumA = sumA2 = sumAngle = sumAngle2 = 0;
  }

  const firstAngle = out.angles[0];
  for (let i = 0; i < out.length; i++) {
    out.revs[i] = Math.floor((Math.abs(out.angles[i] - firstAngle) + 1e-4) / 360);
  }
  return out;
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
function metadataHeader(metadata?: CaptureMetadata, calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION): string {
  const axis = metadata?.axis === 1 ? "AR" : metadata?.axis === 2 ? "DEC" : "unknown";
  const direction = metadata?.direction?.toUpperCase() ?? "unknown";
  const origin = metadata?.originSteps ?? "unknown";
  return `# axis=${axis}\n# direction=${direction}\n# origin_steps=${origin}\n# shunt_ohm=${calibration.shuntOhm}\n# calibration_k=${calibration.k}\n`;
}

export function buildRawCsv(samples: Sample[], rate: number, metadata?: CaptureMetadata, calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION): string {
  const head = `# neq6-logger raw · rate=${rate}Hz · I(A)=adc*${ampsPerRaw(calibration).toFixed(9)}\n${metadataHeader(metadata, calibration)}ts_us,adc_raw,tb_ms\n`;
  const rows = samples.map((s) => `${s.ts},${s.adc},${s.tb}`);
  return head + rows.join("\n") + "\n";
}

export function buildProcCsv(
  rows: {
    ts: number;
    tb: number;
    adc: number;
    amps: number;
    ampsErr: number;
    unw: number;
    angleErr: number;
    rev: number;
    n: number;
  }[],
  rate: number,
  statsTxt: string[],
  metadata?: CaptureMetadata,
  calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION,
): string {
  const head =
    `# neq6-logger procesado · rate=${rate}Hz\n` +
    metadataHeader(metadata, calibration) +
    statsTxt.map((s) => `# ${s}\n`).join("") +
    "ts_us,adc_raw,amps,amps_sem,angle_unwrapped_deg,angle_sem_deg,rev,tb_ms,n_group\n";
  const body = rows.map(
    (r) =>
      `${r.ts.toFixed(3)},${r.adc.toFixed(3)},${r.amps.toFixed(6)},${r.ampsErr.toFixed(6)},${r.unw.toFixed(6)},${r.angleErr.toFixed(6)},${r.rev},${r.tb.toFixed(3)},${r.n}`,
  );
  return head + body.join("\n") + "\n";
}

/** CSV único orientado al usuario: una fila por conversión real del ADC. */
export function buildMeasurementCsv(
  samples: Sample[],
  anglePoints: AnglePoint[],
  metadata?: CaptureMetadata,
  calibration: AdcCalibration = DEFAULT_ADC_CALIBRATION,
  testType: "basic" | "extended" = "basic",
): string {
  const axis = metadata?.axis === 1 ? "AR" : metadata?.axis === 2 ? "DEC" : "desconocido";
  const direction = metadata?.direction?.toUpperCase() ?? "sin movimiento";
  const unwrapped = unwrapDegrees(anglePoints);
  let origin: number | null = null;
  const rows = samples.map((sample) => {
    const absoluteAngle = angleAt(unwrapped, sample.tb);
    if (absoluteAngle !== null && origin === null) origin = absoluteAngle;
    const travel = absoluteAngle !== null && origin !== null ? Math.abs(absoluteAngle - origin) : null;
    const angle = absoluteAngle === null ? "" : (((absoluteAngle % 360) + 360) % 360).toFixed(9);
    const rev = travel === null ? "" : String(Math.floor((travel + 1e-4) / 360) + 1);
    const timestamp = sample.tb > 0 ? new Date(sample.tb).toISOString() : "";
    return `${sample.ts},${timestamp},${sample.adc},${adcToAmps(sample.adc, calibration).toFixed(9)},${angle},${rev}`;
  });
  return [
    `# test=${testType === "extended" ? "extendido" : "basico"}`,
    `# eje=${axis}`,
    `# sentido=${direction}`,
    "# t_us: tiempo monotónico de la muestra medido por el Flipper, en microsegundos",
    "# timestamp: fecha y hora UTC de recepción sincronizada, formato ISO 8601",
    "# adc_raw: lectura digital original del ADC, sin agrupar ni promediar",
    "# amps_raw: corriente calculada para esa lectura con la calibración del shunt, en amperios",
    "# angle: posición angular dentro de la revolución, de 0 a menos de 360 grados; vacía sin movimiento",
    "# rev: revolución de la captura, empezando en 1; vacía sin movimiento",
    `# calibracion: shunt=${calibration.shuntOhm} ohm; k=${calibration.k}`,
    "t_us,timestamp,adc_raw,amps_raw,angle,rev",
    ...rows,
    "",
  ].join("\n");
}

export function parseCsv(text: string): { samples: Sample[]; angles: AnglePoint[]; processed: boolean; metadata: CaptureMetadata; calibration: AdcCalibration } | null {
  const metadata: CaptureMetadata = { ...EMPTY_CAPTURE_METADATA };
  const calibration: AdcCalibration = { ...DEFAULT_ADC_CALIBRATION };
  for (const line of text.split(/\r?\n/)) {
    const axis = line.match(/^#\s*(?:axis|eje)=(AR|DEC)/i)?.[1]?.toUpperCase();
    const direction = line.match(/^#\s*(?:direction|sentido)=(CW|CCW)/i)?.[1]?.toLowerCase();
    const origin = line.match(/^#\s*origin_steps=(-?\d+)/i)?.[1];
    const shunt = line.match(/^#\s*shunt_ohm=([\d.eE+-]+)/i)?.[1];
    const k = line.match(/^#\s*calibration_k=([\d.eE+-]+)/i)?.[1];
    if (axis) metadata.axis = axis === "AR" ? 1 : 2;
    if (direction) metadata.direction = direction as "cw" | "ccw";
    if (origin) metadata.originSteps = Number(origin);
    if (shunt && Number(shunt) > 0) calibration.shuntOhm = Number(shunt);
    if (k && Number(k) > 0) calibration.k = Number(k);
  }
  const lines = text.split(/\r?\n/).filter((l) => l.length && !l.startsWith("#"));
  if (!lines.length) return null;
  const head = lines[0].toLowerCase().split(",");
  const iTs = Math.max(head.indexOf("ts_us"), head.indexOf("t_us"));
  const iAdc = head.indexOf("adc_raw");
  const iTb = head.indexOf("tb_ms");
  const iTimestamp = head.indexOf("timestamp");
  const iAngle = Math.max(head.indexOf("angle_unwrapped_deg"), head.indexOf("angle"));
  if (iTs < 0 || iAdc < 0) return null;
  const processed = head.includes("amps") || head.includes("amps_raw");
  const samples: Sample[] = [];
  const angles: AnglePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(",");
    const ts = Number(c[iTs]);
    let adc = Number(c[iAdc]);
    if (!isFinite(ts) || !isFinite(adc)) continue;
    if (processed && !Number.isInteger(adc)) {
      /* el procesado conserva adc_raw entero; si viniera en amps, revertir */
      const amps = Number(c[head.indexOf("amps")]);
      if (isFinite(amps)) adc = Math.round(amps / ampsPerRaw(calibration));
    }
    const tb = iTb >= 0 ? Number(c[iTb]) || 0 : iTimestamp >= 0 ? Date.parse(c[iTimestamp]) || 0 : 0;
    samples.push({ ts, adc: Math.round(adc), tb });
    if (iAngle >= 0) {
      const angle = Number(c[iAngle]);
      if (Number.isFinite(angle) && Number.isFinite(tb)) {
        angles.push({ tb, deg: ((angle % 360) + 360) % 360 });
      }
    }
  }
  return samples.length ? { samples, angles, processed, metadata, calibration } : null;
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
