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
  /** Semiancho del bin FFT. Dos picos dentro de sus intervalos son compatibles. */
  uncertaintyHz?: number;
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

/** Promedio ligado a la posición: alinea cada espectro en ciclos/grado y
 * vuelve a expresarlo en Hz usando la velocidad media. Conserva como techo el
 * menor Nyquist real de las series de entrada. */
export function averageSpeedNormalizedSpectra(
  series: { spectrum: FftSpectrum; speedDegS: number | null }[],
): FftSpectrum | null {
  const valid = series.filter((item) => item.speedDegS !== null && item.speedDegS > 0
    && item.spectrum.dfHz > 0 && item.spectrum.magnitude.length > 2) as {
      spectrum: FftSpectrum;
      speedDegS: number;
    }[];
  if (!valid.length) return null;
  const referenceSpeed = valid.reduce((sum, item) => sum + item.speedDegS, 0) / valid.length;
  const dfPerDeg = Math.max(...valid.map((item) => item.spectrum.dfHz / item.speedDegS));
  const maxPerDeg = Math.min(...valid.map((item) =>
    ((item.spectrum.magnitude.length - 1) * item.spectrum.dfHz) / item.speedDegS));
  const rawNyquistHz = Math.min(...valid.map((item) =>
    (item.spectrum.magnitude.length - 1) * item.spectrum.dfHz));
  const dfHz = dfPerDeg * referenceSpeed;
  const maxHz = Math.min(rawNyquistHz, maxPerDeg * referenceSpeed);
  const length = Math.floor(maxHz / dfHz) + 1;
  const magnitude = Array.from({ length }, (_, index) => {
    const spatialFrequency = (index * dfHz) / referenceSpeed;
    let sum = 0;
    for (const item of valid) {
      const position = (spatialFrequency * item.speedDegS) / item.spectrum.dfHz;
      const left = Math.min(item.spectrum.magnitude.length - 1, Math.floor(position));
      const right = Math.min(item.spectrum.magnitude.length - 1, left + 1);
      const fraction = position - left;
      sum += item.spectrum.magnitude[left] * (1 - fraction) + item.spectrum.magnitude[right] * fraction;
    }
    return sum / valid.length;
  });
  return { dfHz, magnitude };
}

export interface AngularFftSeries {
  anglesDeg: ArrayLike<number>;
  currentA: ArrayLike<number>;
  speedDegS: number | null;
}

/** Calcula la FFT de la serie promedio, no el promedio de FFT ya calculadas.
 * Las señales se registran primero sobre una rejilla angular común; así un
 * mismo rasgo físico coincide aunque haya pequeñas diferencias de reloj o
 * velocidad entre pasadas. El eje vuelve a expresarse en Hz con la velocidad
 * media medida. */
export function averageAngularSeriesSpectrum(series: AngularFftSeries[], referenceSpeedDegS?: number): FftSpectrum | null {
  const valid = series.filter((item) => {
    const length = Math.min(item.anglesDeg.length, item.currentA.length);
    return length >= 64 && item.speedDegS !== null && item.speedDegS > 0;
  }) as Array<AngularFftSeries & { speedDegS: number }>;
  if (!valid.length) return null;

  const samplesPerRevolution = valid.map((item) => {
    const length = Math.min(item.anglesDeg.length, item.currentA.length);
    let min = Infinity;
    let max = -Infinity;
    for (let index = 0; index < length; index++) {
      const angle = item.anglesDeg[index];
      if (!Number.isFinite(angle)) continue;
      min = Math.min(min, angle);
      max = Math.max(max, angle);
    }
    const revolutions = Number.isFinite(min) && Number.isFinite(max) ? Math.max(1, Math.abs(max - min) / 360) : 1;
    return length / revolutions;
  });
  const available = Math.floor(Math.min(...samplesPerRevolution));
  if (available < 64) return null;
  const gridSize = 2 ** Math.floor(Math.log2(Math.min(65536, available)));
  const profiles: Float64Array[] = [];

  for (const item of valid) {
    const sums = new Float64Array(gridSize);
    const counts = new Uint32Array(gridSize);
    const length = Math.min(item.anglesDeg.length, item.currentA.length);
    for (let index = 0; index < length; index++) {
      const angle = item.anglesDeg[index];
      const current = item.currentA[index];
      if (!Number.isFinite(angle) || !Number.isFinite(current)) continue;
      const phase = ((angle % 360) + 360) % 360;
      const bin = Math.min(gridSize - 1, Math.floor((phase / 360) * gridSize));
      sums[bin] += current;
      counts[bin]++;
    }
    const populated = Array.from(counts, (count, index) => count ? index : -1).filter((index) => index >= 0);
    if (populated.length < 32) continue;
    const profile = new Float64Array(gridSize);
    for (const index of populated) profile[index] = sums[index] / counts[index];
    /* Interpolación circular sólo para huecos entre muestras; no altera los
     * bins que contienen medidas reales. */
    for (let segment = 0; segment < populated.length; segment++) {
      const left = populated[segment];
      const rightRaw = populated[(segment + 1) % populated.length] + (segment === populated.length - 1 ? gridSize : 0);
      const span = rightRaw - left;
      const leftValue = profile[left];
      const rightValue = profile[rightRaw % gridSize];
      for (let offset = 1; offset < span; offset++) {
        profile[(left + offset) % gridSize] = leftValue + (rightValue - leftValue) * offset / span;
      }
    }
    profiles.push(profile);
  }
  if (!profiles.length) return null;
  const average = new Float64Array(gridSize);
  for (let index = 0; index < gridSize; index++) {
    for (const profile of profiles) average[index] += profile[index];
    average[index] /= profiles.length;
  }
  const referenceSpeed = referenceSpeedDegS && referenceSpeedDegS > 0
    ? referenceSpeedDegS
    : valid.reduce((sum, item) => sum + item.speedDegS, 0) / valid.length;
  return { dfHz: referenceSpeed / 360, magnitude: Array.from(fftMag(average)) };
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
const frequencyCompatible = (a: ExtendedPeak, b: ExtendedPeak, relativeTolerance = 0.05) =>
  Math.abs(a.frequencyHz - b.frequencyHz) <= Math.max(
    relativeTolerance * Math.max(a.frequencyHz, b.frequencyHz),
    (a.uncertaintyHz ?? 0) + (b.uncertaintyHz ?? 0),
  );

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
      const sameHz = frequencyCompatible(a.peak, b.peak);
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
      a.pass.id !== b.pass.id && frequencyCompatible(a.peak, b.peak)));
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
  /* :j y :S usan un contador modular de 24 bits. En la NEQ6 una vuelta del
   * eje puede superar media escala del contador, de modo que restar dos
   * lecturas firmadas produce falsos desplazamientos >360°. Reconstruimos el
   * destino de la revolución capturada, lo envolvemos como hace la placa y
   * desenvolvemos sólo la diferencia final. */
  const width = 0x1000000;
  const half = width / 2;
  const targetUnwrapped = metadata.originSteps + sign * (normalized * cpr) / 360;
  const target = ((((targetUnwrapped + half) % width) + width) % width) - half;
  let deltaSteps = target - currentSteps;
  if (deltaSteps > half) deltaSteps -= width;
  else if (deltaSteps < -half) deltaSteps += width;
  return (deltaSteps * 360) / cpr;
}

export function basicRevolutionSeriesCount(angleTravelDeg: number): number {
  const travel = Math.max(0, angleTravelDeg);
  const completed = Math.max(0, Math.floor((travel + 0.05) / 360));
  const endsOnBoundary = completed > 0 && Math.abs(travel - completed * 360) <= 0.05;
  return Math.max(1, completed + (endsOnBoundary ? 0 : 1));
}

/** Recorrido positivo desde el origen de captura, también cuando el
 * feedback absoluto decrece durante un giro CCW. */
export function travelFromCaptureOrigin(angleDeg: number, originDeg: number): number {
  return Math.abs(angleDeg - originDeg);
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
  aiAnalyses?: Array<{
    providerId: string;
    providerName: string;
    fingerprint: string;
    text: string;
    updatedAt: number;
  }>;
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
  n = Math.min(n, 65536);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  const m = Math.min(input.length, n);
  /* ventana de Hann para reducir fugas */
  for (let i = 0; i < m; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (m - 1 || 1));
    re[i] = input[i] * w;
  }
  /* Orden bit-reversed requerido por Cooley–Tukey iterativo. Sin esta
   * permutación las magnitudes parecen espectrales, pero sus bins no
   * corresponden a las frecuencias reales. */
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      const real = re[i]; re[i] = re[j]; re[j] = real;
      const imaginary = im[i]; im[i] = im[j]; im[j] = imaginary;
    }
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

/** Espectro temporal hasta el Nyquist de la tasa efectiva. Para adquisiciones
 * largas usa Welch con ventanas de 65536 muestras, evitando reducir toda la
 * captura a 4096 puntos y perder banda. */
export function timedFftSpectrum(
  timestampsUs: ArrayLike<number>,
  values: Float64Array,
  maxFftSize = 65536,
): FftSpectrum | null {
  const length = Math.min(timestampsUs.length, values.length);
  if (length < 64) return null;
  const durationS = (timestampsUs[length - 1] - timestampsUs[0]) / 1e6;
  if (!(durationS > 0)) return null;
  const effectiveRateHz = (length - 1) / durationS;
  const ceiling = 2 ** Math.floor(Math.log2(Math.max(64, maxFftSize)));

  if (length <= ceiling) {
    let fftSize = 64;
    while (fftSize < length && fftSize < ceiling) fftSize <<= 1;
    const timestamps = Array.from({ length }, (_, index) => timestampsUs[index]);
    const uniform = resampleUniform(timestamps, values.subarray(0, length), fftSize);
    const full = fftMag(uniform);
    const resampledRateHz = (fftSize - 1) / durationS;
    const dfHz = resampledRateHz / fftSize;
    const nyquistHz = effectiveRateHz / 2;
    const bins = Math.min(full.length, Math.floor(nyquistHz / dfHz) + 1);
    return { dfHz, magnitude: Array.from(full.subarray(0, bins)) };
  }

  const fftSize = ceiling;
  const hop = fftSize >> 1;
  const starts: number[] = [];
  for (let start = 0; start + fftSize <= length; start += hop) starts.push(start);
  const finalStart = length - fftSize;
  if (starts[starts.length - 1] !== finalStart) starts.push(finalStart);
  const sum = new Float64Array(fftSize / 2);
  const dfHz = effectiveRateHz / fftSize;
  for (const start of starts) {
    const timestamps = Array.from({ length: fftSize }, (_, index) => timestampsUs[start + index]);
    const segmentDurationS = (timestamps[fftSize - 1] - timestamps[0]) / 1e6;
    if (!(segmentDurationS > 0)) continue;
    const uniform = resampleUniform(timestamps, values.subarray(start, start + fftSize), fftSize);
    const magnitude = fftMag(uniform);
    const segmentDfHz = ((fftSize - 1) / segmentDurationS) / fftSize;
    for (let bin = 0; bin < sum.length; bin++) {
      const position = Math.min(magnitude.length - 1, (bin * dfHz) / segmentDfHz);
      const left = Math.floor(position);
      const right = Math.min(magnitude.length - 1, left + 1);
      const fraction = position - left;
      sum[bin] += magnitude[left] * (1 - fraction) + magnitude[right] * fraction;
    }
  }
  const magnitude = Array.from(sum, (value) => value / starts.length);
  return { dfHz, magnitude };
}

/** Migra sesiones extendidas creadas con la FFT antigua. Las muestras de cada
 * pasada ya están ordenadas; su duración permite reconstruir el eje temporal
 * uniforme y recalcular espectro, picos y Nyquist. */
export function refreshExtendedAnalysisSpectra(analysis: ExtendedAnalysis): ExtendedAnalysis {
  const passes = analysis.passes.map((pass) => {
    const currents = pass.samples?.currentA ?? [];
    const durationS = pass.statistics.durationS;
    if (currents.length < 64 || !(durationS > 0)) return pass;
    const timestamps = Array.from({ length: currents.length }, (_, index) =>
      index * durationS * 1e6 / Math.max(1, currents.length - 1));
    const spectrum = timedFftSpectrum(timestamps, Float64Array.from(currents));
    if (!spectrum) return pass;
    const speed = pass.measuredSpeedDegS;
    const peaks = topPeaks(Float64Array.from(spectrum.magnitude), spectrum.dfHz, 40).map((peak) => ({
      frequencyHz: peak.freq,
      uncertaintyHz: spectrum.dfHz / 2,
      periodMountDeg: speed ? peak.period * speed : null,
      magnitude: peak.mag,
    }));
    return { ...pass, spectrum, revolutionSpectra: [spectrum], peaks };
  });
  return { ...analysis, passes, groups: classifyExtendedPeaks(passes) };
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
  ampsStd: Float64Array; /* desviación típica dentro de la ventana */
  ampsErr: Float64Array; /* SEM corregido por autocorrelación lag-1 */
  angles: Float64Array; /* grados desenvueltos */
  angleStd: Float64Array; /* desviación típica dentro de la ventana */
  angleErr: Float64Array; /* SEM corregido por autocorrelación lag-1 */
  revs: Int32Array;
  counts: Uint16Array;
}

export interface MovingWindowStats {
  length: number;
  mean: Float64Array;
  std: Float64Array;
  sem: Float64Array;
  effectiveN: Float64Array;
}

/** Estadísticos de una ventana móvil de N muestras. La incertidumbre usa el
 * tamaño efectivo N/(1+2(1-1/N)rho1), donde rho1 es la autocorrelación a un
 * retardo; así las muestras consecutivas correlacionadas no se tratan como N
 * observaciones independientes. El cálculo es deslizante O(n), no O(n·N). */
export function movingWindowStats(values: ArrayLike<number>, factor: number): MovingWindowStats | null {
  const m = Math.max(1, Math.floor(factor));
  const n = values.length;
  const windows = n - m + 1;
  if (windows <= 0) return null;
  const out: MovingWindowStats = {
    length: windows,
    mean: new Float64Array(windows),
    std: new Float64Array(windows),
    sem: new Float64Array(windows),
    effectiveN: new Float64Array(windows),
  };
  let sum = 0, sum2 = 0, adjacent = 0;
  for (let i = 0; i < m; i++) {
    const value = values[i];
    sum += value;
    sum2 += value * value;
    if (i) adjacent += values[i - 1] * value;
  }
  for (let start = 0; start < windows; start++) {
    const avg = sum / m;
    const populationVariance = m > 1 ? Math.max(0, sum2 / m - avg * avg) : 0;
    const sampleVariance = m > 1 ? populationVariance * m / (m - 1) : 0;
    const rho1 = m > 1 && populationVariance > 1e-18
      ? Math.max(0, Math.min(0.999, (adjacent / (m - 1) - avg * avg) / populationVariance))
      : 0;
    const effectiveN = m / (1 + 2 * (1 - 1 / m) * rho1);
    out.mean[start] = avg;
    out.std[start] = Math.sqrt(sampleVariance);
    out.effectiveN[start] = effectiveN;
    out.sem[start] = out.std[start] / Math.sqrt(effectiveN);
    if (start + m >= n) continue;
    adjacent -= values[start] * values[start + 1];
    adjacent += values[start + m - 1] * values[start + m];
    const old = values[start], next = values[start + m];
    sum += next - old;
    sum2 += next * next - old * old;
  }
  return out;
}

/** Aplica una media móvil temporal de N muestras que tienen ángulo.
 * Con N=1 se conserva cada dato; con N>1 cada nueva muestra completa una
 * ventana y por tanto la curva conserva la resolución temporal. */
export function averageAngleSeries(
  ts: ArrayLike<number>,
  tb: ArrayLike<number>,
  adc: ArrayLike<number>,
  amps: ArrayLike<number>,
  angles: ArrayLike<number>,
  factor: number,
): AveragedSeries | null {
  const m = Math.max(1, Math.floor(factor));
  const size = Math.min(ts.length, tb.length, adc.length, amps.length, angles.length);
  const validTs: number[] = [], validTb: number[] = [], validAdc: number[] = [], validAmps: number[] = [], validAngles: number[] = [];
  for (let i = 0; i < size; i++) {
    if (!Number.isFinite(angles[i])) continue;
    validTs.push(ts[i]); validTb.push(tb[i]); validAdc.push(adc[i]);
    validAmps.push(amps[i]); validAngles.push(angles[i]);
  }
  const tsStats = movingWindowStats(validTs, m);
  const tbStats = movingWindowStats(validTb, m);
  const adcStats = movingWindowStats(validAdc, m);
  const ampsStats = movingWindowStats(validAmps, m);
  const angleStats = movingWindowStats(validAngles, m);
  if (!tsStats || !tbStats || !adcStats || !ampsStats || !angleStats) return null;
  const groups = tsStats.length;

  const out: AveragedSeries = {
    length: groups,
    factor: m,
    ts: new Float64Array(groups),
    tb: new Float64Array(groups),
    adc: new Float64Array(groups),
    amps: new Float64Array(groups),
    ampsStd: new Float64Array(groups),
    ampsErr: new Float64Array(groups),
    angles: new Float64Array(groups),
    angleStd: new Float64Array(groups),
    angleErr: new Float64Array(groups),
    revs: new Int32Array(groups),
    counts: new Uint16Array(groups),
  };

  for (let group = 0; group < groups; group++) {
    out.ts[group] = tsStats.mean[group];
    out.tb[group] = tbStats.mean[group];
    out.adc[group] = adcStats.mean[group];
    out.amps[group] = ampsStats.mean[group];
    out.ampsStd[group] = ampsStats.std[group];
    out.ampsErr[group] = ampsStats.sem[group];
    out.angles[group] = angleStats.mean[group];
    out.angleStd[group] = angleStats.std[group];
    out.angleErr[group] = angleStats.sem[group];
    out.counts[group] = m;
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
    ampsStd: number;
    ampsErr: number;
    unw: number;
    angleStd: number;
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
    "ts_us,adc_raw,amps,amps_std,amps_sem,angle_unwrapped_deg,angle_std_deg,angle_sem_deg,rev,tb_ms,n_group\n";
  const body = rows.map(
    (r) =>
      `${r.ts.toFixed(3)},${r.adc.toFixed(3)},${r.amps.toFixed(6)},${r.ampsStd.toFixed(6)},${r.ampsErr.toFixed(6)},${r.unw.toFixed(6)},${r.angleStd.toFixed(6)},${r.angleErr.toFixed(6)},${r.rev},${r.tb.toFixed(3)},${r.n}`,
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
