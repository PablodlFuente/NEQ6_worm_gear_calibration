import { useEffect, useMemo, useRef, useState } from "react";
import { useBle } from "./useBle";
import { useFlipperSerial } from "./useFlipperSerial";
import {
  adcToAmps,
  averageFftSpectra,
  chooseSampleClockOffset,
  averageAngleSeries,
  binCartesian,
  angleAt,
  buildMeasurementCsv,
  buildProcCsv,
  buildRawCsv,
  circularStats,
  fftMag,
  fitPolarEllipse,
  idb,
  mean,
  median,
  parseCsv,
  resampleUniform,
  std,
  topPeaks,
  unwrapDegrees,
  type AnglePoint,
  type AdcCalibration,
  type CaptureMetadata,
  type ExtendedAnalysis,
  type ExtendedPassResult,
  type Sample,
  type Session,
  EMPTY_CAPTURE_METADATA,
  DEFAULT_ADC_CALIBRATION,
} from "../lib/flipper";
import { buildZip, downloadBlob } from "../lib/zip";

const MAX_SAMPLES = 1_500_000;

interface Props {
  cpr1?: number;
}

export function useFlipper({ cpr1 }: Props) {
  /* buffers crudos — NUNCA se modifican */
  const tbRef = useRef<number[]>([]);
  const tsRef = useRef<number[]>([]);
  const adcRef = useRef<number[]>([]);
  const angleRef = useRef<AnglePoint[]>([]);

  const [version, setVersion] = useState(0);
  const [tick, setTick] = useState(0);
  const [rate, setRate] = useState(100);
  const [capturing, setCapturing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [sync, setSync] = useState<{ offsetMs: number; jitterMs: number; rtt: number; n: number } | null>(null);
  const [angleOn, setAngleOn] = useState(true);
  const [avgFactor, setAvgFactor] = useState(1);
  const [overlayRevs, setOverlayRevs] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [consoleLines, setConsoleLines] = useState<Array<{ id: number; time: number; direction: "tx" | "rx"; text: string }>>([]);
  const consoleIdRef = useRef(0);
  const [deviceInfo, setDeviceInfo] = useState<{
    version: string;
    requestedHz: number;
    timerHz: number;
    outOfRange: number;
    overflow: number;
    overflowDelta: number | null;
    total: number;
  } | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [calibration, setCalibrationState] = useState<AdcCalibration>(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("neq6-adc-calibration") ?? "null") as Partial<AdcCalibration> | null;
      return saved && Number(saved.shuntOhm) > 0 && Number(saved.k) > 0
        ? { shuntOhm: Number(saved.shuntOhm), k: Number(saved.k) }
        : { ...DEFAULT_ADC_CALIBRATION };
    } catch {
      return { ...DEFAULT_ADC_CALIBRATION };
    }
  });
  const calibrationRef = useRef(calibration);
  const [captureMetadata, setCaptureMetadataState] = useState<CaptureMetadata>({ ...EMPTY_CAPTURE_METADATA });
  const [extendedAnalysis, setExtendedAnalysis] = useState<ExtendedAnalysis | null>(null);
  const captureMetadataRef = useRef<CaptureMetadata>({ ...EMPTY_CAPTURE_METADATA });
  const extendedFilesRef = useRef<{ name: string; data: string }[]>([]);

  const pendingLineRef = useRef<((line: string) => void) | null>(null);
  const commandQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const captureGenerationRef = useRef(0);
  const overflowBaselineRef = useRef<number | null>(null);
  const capturingRef = useRef(false);
  const sampleClockOffsetRef = useRef<number | null>(null);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  const onSamples = (batch: Sample[]) => {
    if (!batch.length) return;
    const tb = tbRef.current;
    const ts = tsRef.current;
    const adc = adcRef.current;
    const clock = syncRef.current;
    if (sampleClockOffsetRef.current === null) {
      const anchor = batch[batch.length - 1];
      sampleClockOffsetRef.current = chooseSampleClockOffset(
        clock?.offsetMs ?? null,
        anchor.ts,
        anchor.tb,
      );
    }
    const clockOffset = sampleClockOffsetRef.current;
    for (const s of batch) {
      /* Fecha real de adquisición, no fecha de llegada del paquete BLE/USB. */
      tb.push(s.ts / 1000 - clockOffset);
      ts.push(s.ts);
      adc.push(s.adc);
    }
    /* STOP puede confirmarse antes de que el ring termine de vaciarse. Las
     * últimas tramas siguen siendo válidas y deben provocar un render final. */
    if (!capturingRef.current) setVersion((value) => value + 1);
    if (tb.length > MAX_SAMPLES) {
      void stopCapture(false);
      setNotice(
        `Buffer lleno (${MAX_SAMPLES.toLocaleString("es-ES")} muestras) — captura detenida. Exporta o guarda la sesión.`,
      );
    }
  };

  const onLine = (line: string) => {
    setConsoleLines((current) => [...current.slice(-299), { id: ++consoleIdRef.current, time: Date.now(), direction: "rx", text: line }]);
    if (pendingLineRef.current) {
      const resolve = pendingLineRef.current;
      pendingLineRef.current = null;
      resolve(line);
    }
  };

  const onDrop = (label: string) => {
    capturingRef.current = false;
    setCapturing(false);
    setSync(null);
    setNotice(`Flipper desconectado (${label}).`);
    setVersion((v) => v + 1);
  };

  /* ── transportes BLE y USB CDC ───────────────────────── */
  const ble = useBle({
    onSamples,
    onLine,
    onDrop: () => onDrop("BLE"),
  });
  const usb = useFlipperSerial({
    onSamples,
    onLine,
    onDrop: () => onDrop("USB-COM"),
  });

  const transport = ble.state === "connected" ? "ble" : usb.state === "connected" ? "usb" : null;
  const connected = transport !== null;
  const sendText = (cmd: string) => {
    if (transport === "ble") return ble.sendText(cmd);
    if (transport === "usb") return usb.sendText(cmd);
    return Promise.reject(new Error("Flipper no conectado"));
  };

  const sendCmdNow = (cmd: string, timeout = 900): Promise<string | null> =>
    new Promise((resolve) => {
      setConsoleLines((current) => [...current.slice(-299), { id: ++consoleIdRef.current, time: Date.now(), direction: "tx", text: cmd }]);
      let done = false;
      const timer = window.setTimeout(() => {
        if (!done) {
          done = true;
          pendingLineRef.current = null;
          resolve(null);
        }
      }, timeout);
      pendingLineRef.current = (line) => {
        if (!done) {
          done = true;
          window.clearTimeout(timer);
          resolve(line);
        }
      };
      sendText(cmd).catch(() => {
        if (!done) {
          done = true;
          window.clearTimeout(timer);
          pendingLineRef.current = null;
          resolve(null);
        }
      });
    });

  /* BLE y CDC multiplexan respuestas y muestras en un único flujo. Mantener
   * una sola petición ASCII en vuelo evita que un OK de STOP resuelva RATE o
   * que SYNC intercepte la confirmación de START. */
  const sendCmd = (cmd: string, timeout = 900): Promise<string | null> => {
    const task = commandQueueRef.current.then(
      () => sendCmdNow(cmd, timeout),
      () => sendCmdNow(cmd, timeout),
    );
    commandQueueRef.current = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  };

  /* ── sincronización de relojes (offset + drift) ──────── */
  const doSync = async () => {
    if (!connected || capturingRef.current) return;
    setSyncing(true);
    const offsets: number[] = [];
    const rtts: number[] = [];
    for (let i = 0; i < 6; i++) {
      const d0 = Date.now();
      const p0 = performance.now();
      const line = await sendCmd("SYNC", 800);
      const p1 = performance.now();
      if (!line || !line.startsWith("SYNC ")) continue;
      const us = Number(line.slice(5));
      if (!isFinite(us)) continue;
      const rtt = p1 - p0;
      const offset = us / 1000 - (d0 + rtt / 2);
      offsets.push(offset);
      rtts.push(rtt);
      await new Promise((r) => setTimeout(r, 90));
    }
    if (offsets.length >= 3) {
      const sorted = [...offsets].sort((a, b) => a - b);
      const midpoint = sorted[Math.floor(sorted.length / 2)];
      const deviations = offsets.map((value) => Math.abs(value - midpoint));
      setSync({
        offsetMs: midpoint,
        jitterMs: median(deviations),
        rtt: median(rtts),
        n: offsets.length,
      });
      setNotice(null);
    } else {
      setNotice("Sincronización fallida: el Flipper no respondió a SYNC.");
    }
    setSyncing(false);
  };

  useEffect(() => {
    if (connected) {
      void doSync();
    } else {
      captureGenerationRef.current++;
      capturingRef.current = false;
      setCapturing(false);
      setSync(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transport]);

  /* ── captura ─────────────────────────────────────────── */
  const startCapture = async (rateOverride?: number): Promise<boolean> => {
    if (!connected) {
      setNotice("Conecta el Flipper por BLE o USB-COM antes de capturar.");
      return false;
    }
    const requestedRate = rateOverride ?? rate;
    const generation = ++captureGenerationRef.current;
    sampleClockOffsetRef.current = null;
    setRate(requestedRate);
    /* INFO.ovf se acumula desde que arranca el firmware. Conservamos la
     * base de la captura para que la alarma identifique pérdidas nuevas. */
    overflowBaselineRef.current = deviceInfo?.overflow ?? null;
    setDeviceInfo(null);
    setNotice(null);
    const r1 = await sendCmd(`RATE ${requestedRate}`);
    if (!r1 || r1 !== "OK") {
      setNotice(`El Flipper no confirmó la tasa (${r1 ?? "timeout"}).`);
      return false;
    }
    if (generation !== captureGenerationRef.current) return false;
    const r2 = await sendCmd("START");
    if (!r2 || r2 !== "OK") {
      setNotice(`El Flipper no confirmó START (${r2 ?? "timeout"}).`);
      return false;
    }
    if (generation !== captureGenerationRef.current) {
      await sendCmd("STOP", 700);
      return false;
    }
    capturingRef.current = true;
    setCapturing(true);
    return true;
  };

  const stopCapture = async (bump = true) => {
    captureGenerationRef.current++;
    capturingRef.current = false;
    setCapturing(false);
    if (connected) {
      await sendCmd("STOP", 700);
      const info = await sendCmd("INFO", 900);
      const match = info?.match(/^INFO\s+(\S+)\s+r=(\d+)\s+a=(\d+)\s+c=\d+\s+oor=(\d+)\s+ovf=(\d+)\s+n=(\d+)$/);
      if (match) {
        setDeviceInfo({
          version: match[1],
          requestedHz: Number(match[2]),
          timerHz: Number(match[3]),
          outOfRange: Number(match[4]),
          overflow: Number(match[5]),
          overflowDelta: overflowBaselineRef.current === null
            ? null
            : Math.max(0, Number(match[5]) - overflowBaselineRef.current),
          total: Number(match[6]),
        });
      }
    }
    if (bump) setVersion((v) => v + 1);
  };

  useEffect(() => {
    if (!capturing) return;
    const iv = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => window.clearInterval(iv);
  }, [capturing]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 5_000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const recordAngle = (deg: number, tb = Date.now()) => {
    /* startAxisTest limpia la serie antes de cada prueba. No descartamos un
     * feedback :j válido por una transición asíncrona de React/START: ese era
     * precisamente el caso que dejaba corriente sin ángulo en plena captura. */
    if (!angleOn) return;
    angleRef.current.push({ tb, deg: ((deg % 360) + 360) % 360 });
  };

  const setCaptureMetadata = (metadata: CaptureMetadata) => {
    captureMetadataRef.current = { ...metadata };
    setCaptureMetadataState({ ...metadata });
  };

  const setCalibration = (next: AdcCalibration) => {
    if (!(next.shuntOhm > 0) || !(next.k > 0)) return;
    calibrationRef.current = { ...next };
    setCalibrationState({ ...next });
    localStorage.setItem("neq6-adc-calibration", JSON.stringify(next));
    setVersion((value) => value + 1);
  };

  const snapshotExtendedPass = (
    id: string,
    label: string,
    direction: "cw" | "ccw" | "stationary",
    requestedSpeedDegS: number,
  ): ExtendedPassResult | null => {
    const n = adcRef.current.length;
    if (n < 64) return null;
    const durationS = (tsRef.current[n - 1] - tsRef.current[0]) / 1e6;
    if (!(durationS > 0.5)) return null;
    const amps = new Float64Array(n);
    for (let i = 0; i < n; i++) amps[i] = adcToAmps(adcRef.current[i], calibrationRef.current);
    const angles = unwrapDegrees(angleRef.current);
    const speeds: number[] = [];
    for (let i = 1; i < angles.length; i++) {
      const dt = (angles[i].tb - angles[i - 1].tb) / 1000;
      const da = Math.abs(angles[i].deg - angles[i - 1].deg);
      if (dt > 0 && da > 0) speeds.push(da / dt);
    }
    const measuredSpeedDegS = speeds.length ? median(speeds) : null;
    const positionedAngles: number[] = [];
    const positionedCurrents: number[] = [];
    const revolutionTs: number[][] = [];
    const revolutionAmps: number[][] = [];
    const binSum = new Float64Array(360);
    const binCount = new Uint32Array(360);
    let maxA = -Infinity;
    let maxAngleDeg: number | null = null;
    for (let i = 0; i < n; i++) {
      const angle = angleAt(angles, tbRef.current[i]);
      if (angle === null) continue;
      const phase = ((angle % 360) + 360) % 360;
      positionedAngles.push(angle);
      positionedCurrents.push(amps[i]);
      const travel = Math.abs(angle - angles[0].deg);
      const revolution = Math.max(0, Math.floor(Math.max(0, travel - 1e-6) / 360));
      (revolutionTs[revolution] ??= []).push(tsRef.current[i]);
      (revolutionAmps[revolution] ??= []).push(amps[i]);
      const bin = Math.min(359, Math.floor(phase));
      binSum[bin] += amps[i];
      binCount[bin]++;
      if (amps[i] > maxA) {
        maxA = amps[i];
        maxAngleDeg = phase;
      }
    }
    const circular = positionedAngles.length ? circularStats(positionedAngles, positionedCurrents) : null;
    const angleSpanDeg = angles.length >= 2 ? Math.abs(angles[angles.length - 1].deg - angles[0].deg) : 0;
    const sdA = std(amps);
    if (!Number.isFinite(maxA)) {
      maxA = 0;
      for (let i = 0; i < amps.length; i++) maxA = Math.max(maxA, amps[i]);
    }
    const magnitude = fftMag(resampleUniform(tsRef.current, amps, 4096));
    const dfHz = 1 / durationS;
    const revolutionSpectra = revolutionTs.flatMap((timestamps, index) => {
      const values = revolutionAmps[index];
      if (!values || timestamps.length < 64) return [];
      const revolutionDurationS = (timestamps[timestamps.length - 1] - timestamps[0]) / 1e6;
      if (!(revolutionDurationS > 0.5)) return [];
      return [{ dfHz: 1 / revolutionDurationS, magnitude: Array.from(fftMag(resampleUniform(timestamps, Float64Array.from(values), 4096))) }];
    });
    return {
      id,
      label,
      direction,
      requestedSpeedDegS,
      measuredSpeedDegS,
      peaks: topPeaks(magnitude, 1 / durationS, 40).map((peak) => ({
        frequencyHz: peak.freq,
        periodMountDeg: measuredSpeedDegS ? peak.period * measuredSpeedDegS : null,
        magnitude: peak.mag,
      })),
      statistics: {
        n,
        durationS,
        effectiveRateHz: (n - 1) / durationS,
        meanA: mean(amps),
        medianA: median(amps),
        sdA,
        semA: n > 1 ? sdA / Math.sqrt(n) : 0,
        maxA,
        maxAngleDeg,
        angleSpanDeg,
        measuredSpeedDegS,
        samplesPerDeg: angleSpanDeg > 0 ? positionedAngles.length / angleSpanDeg : null,
        circularMeanDeg: circular?.meanDeg ?? null,
        circularR: circular?.R ?? null,
        circularStdDeg: circular?.stdDeg ?? null,
        ellipse: positionedAngles.length >= 12 ? fitPolarEllipse(positionedAngles, positionedCurrents) : null,
      },
      spectrum: { dfHz, magnitude: Array.from(magnitude) },
      revolutionSpectra,
      samples: {
        anglesDeg: positionedAngles,
        currentA: positionedCurrents,
      },
      profile: {
        anglesDeg: Array.from({ length: 360 }, (_, index) => index + 0.5),
        currentA: Array.from(binSum, (sum, index) => binCount[index] ? sum / binCount[index] : null),
      },
    };
  };

  const resetExtendedArchive = () => {
    extendedFilesRef.current = [];
  };

  const archiveExtendedPass = (id: string) => {
    extendedFilesRef.current.push({
      name: `${id}-medidas.csv`,
      data: buildMeasurementCsv(makeSamples(), angleRef.current, captureMetadataRef.current, calibrationRef.current, "extended"),
    });
  };

  useEffect(() => {
    void idb.list().then(setSessions).catch(() => setSessions([]));
  }, []);

  /* ── derivadas (procesado no destructivo) ────────────── */
  const derived = useMemo(() => {
    const n = adcRef.current.length;
    if (!n) return null;
    const amps = new Float64Array(n);
    for (let i = 0; i < n; i++) amps[i] = adcToAmps(adcRef.current[i], calibration);

    const unwrapped = unwrapDegrees(angleRef.current);
    let perUnw: Float64Array | null = null;
    let revOf: Int32Array | null = null;
    const revTimes: number[] = [];
    let nRevs = 0;
    if (unwrapped.length >= 2) {
      perUnw = new Float64Array(n);
      let has = false;
      for (let i = 0; i < n; i++) {
        const u = angleAt(unwrapped, tbRef.current[i]);
        if (u !== null) {
          perUnw[i] = u;
          has = true;
        } else perUnw[i] = NaN;
      }
      if (has) {
        revOf = new Int32Array(n);
        let firstValid = 0;
        while (firstValid < n && !Number.isFinite(perUnw[firstValid])) firstValid++;
        const origin = perUnw[firstValid];
        let prevK = 0;
        let maxTravel = 0;
        for (let i = 0; i < n; i++) {
          const u = perUnw[i];
          const travel = Number.isFinite(u) ? Math.abs(u - origin) : 0;
          if (travel > maxTravel) maxTravel = travel;
          const k = Number.isFinite(u) ? Math.floor((travel + 1e-4) / 360) : prevK;
          if (k !== prevK) {
            revTimes.push(tbRef.current[i]);
            prevK = k;
          }
          revOf[i] = k;
        }
        nRevs = Math.max(0, Math.floor((maxTravel + 0.05) / 360));
      }
    }

    const m = Math.max(1, avgFactor);
    const avgA: number[] = [];
    for (let i = 0; i + m <= n; i += m) {
      let s = 0;
      for (let j = 0; j < m; j++) s += amps[i + j];
      avgA.push(s / m);
    }

    const plot = perUnw
      ? averageAngleSeries(tsRef.current, tbRef.current, adcRef.current, amps, perUnw, m)
      : null;
    const angleSpanDeg = unwrapped.length >= 2
      ? Math.abs(unwrapped[unwrapped.length - 1].deg - unwrapped[0].deg)
      : 0;
    const ellipse = plot && angleSpanDeg >= 330 ? fitPolarEllipse(plot.angles, plot.amps) : null;
    const sectorAngles: number[] = [];
    const sectorCurrents: number[] = [];
    if (perUnw) {
      for (let i = 0; i < n; i++) {
        if (!Number.isFinite(perUnw[i])) continue;
        sectorAngles.push(perUnw[i]);
        sectorCurrents.push(amps[i]);
      }
    }
    const sectors = sectorAngles.length ? binCartesian(sectorAngles, sectorCurrents, 36) : [];
    const populatedSectors = sectors.filter((sector) => Number.isFinite(sector.mean));
    const maxSector = populatedSectors.length
      ? populatedSectors.reduce((best, sector) => sector.mean > best.mean ? sector : best)
      : null;
    const minSector = populatedSectors.length
      ? populatedSectors.reduce((best, sector) => sector.mean < best.mean ? sector : best)
      : null;

    const D = (tsRef.current[n - 1] - tsRef.current[0]) / 1e6;
    let mag: Float64Array | null = null;
    let peaks: ReturnType<typeof topPeaks> = [];
    const NFFT = 4096;
    if (n >= 64 && D > 0.5) {
      const uni = resampleUniform(tsRef.current, amps, NFFT);
      mag = fftMag(uni);
      peaks = topPeaks(mag, 1 / D, 5);
    }

    const st = {
      n,
      nAvg: avgA.length,
      mean: mean(avgA),
      median: median(avgA),
      sd: std(avgA),
      sem: avgA.length > 1 ? std(avgA) / Math.sqrt(avgA.length) : 0,
      durS: D,
      rateEst: D > 0 ? (n - 1) / D : 0,
      circ: plot ? circularStats(Array.from(plot.angles), plot.amps) : null,
      dThetaEnc: cpr1 ? 360 / cpr1 : null,
      feedbackSpeedDegS: null as number | null,
      samplesPerDeg: null as number | null,
      angleSpanDeg,
      maxA: 0,
      maxAngleDeg: null as number | null,
    };
    if (unwrapped.length >= 2 && perUnw) {
      const angleSpan = angleSpanDeg;
      const segmentSpeeds: number[] = [];
      for (let i = 1; i < unwrapped.length; i++) {
        const dtS = (unwrapped[i].tb - unwrapped[i - 1].tb) / 1000;
        const dDeg = Math.abs(unwrapped[i].deg - unwrapped[i - 1].deg);
        if (dtS > 0 && dDeg > 1e-9) segmentSpeeds.push(dDeg / dtS);
      }
      let positionedSamples = 0;
      for (let i = 0; i < perUnw.length; i++) {
        if (Number.isFinite(perUnw[i])) positionedSamples++;
      }
      if (angleSpan > 0) st.samplesPerDeg = positionedSamples / angleSpan;
      if (segmentSpeeds.length) st.feedbackSpeedDegS = median(segmentSpeeds);
    }
    let mx = 0;
    for (let i = 0; i < n; i++) {
      if (amps[i] <= mx) continue;
      mx = amps[i];
      st.maxAngleDeg = perUnw && Number.isFinite(perUnw[i])
        ? ((perUnw[i] % 360) + 360) % 360
        : null;
    }
    st.maxA = mx;

    return {
      amps,
      perUnw,
      revOf,
      revTimes,
      nRevs,
      avgA,
      plot,
      ellipse,
      sectors,
      maxSector,
      minSector,
      mag,
      peaks,
      df: D > 0 ? 1 / D : 0,
      st,
      hasAngle: Boolean(plot?.length),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, avgFactor, cpr1, tick, calibration]);

  /* ── export / import / sesiones ──────────────────────── */
  const makeSamples = (): Sample[] =>
    tbRef.current.map((tb, i) => ({ tb, ts: tsRef.current[i], adc: adcRef.current[i] }));

  const download = (name: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");

  const rawCsvText = () => buildRawCsv(makeSamples(), rate, captureMetadataRef.current, calibrationRef.current);

  const measurementCsvText = (testType: "basic" | "extended" = "basic") =>
    buildMeasurementCsv(makeSamples(), angleRef.current, captureMetadataRef.current, calibrationRef.current, testType);

  const processedCsvText = () => {
    if (!derived?.plot) return null;
    const rows = Array.from({ length: derived.plot.length }, (_, i) => ({
      ts: derived.plot!.ts[i],
      tb: derived.plot!.tb[i],
      adc: derived.plot!.adc[i],
      amps: derived.plot!.amps[i],
      ampsStd: derived.plot!.ampsStd[i],
      ampsErr: derived.plot!.ampsErr[i],
      unw: derived.plot!.angles[i],
      angleStd: derived.plot!.angleStd[i],
      angleErr: derived.plot!.angleErr[i],
      rev: derived.plot!.revs[i],
      n: derived.plot!.counts[i],
    }));
    const statsTxt = [
      `media=${derived.st.mean.toFixed(6)} A · mediana=${derived.st.median.toFixed(6)} A · σ=${derived.st.sd.toFixed(6)} A`,
      `σ_media=${derived.st.sem.toExponential(3)} A · N=${derived.st.n} · factor=${avgFactor}`,
      derived.st.feedbackSpeedDegS !== null
        ? `velocidad_feedback=${derived.st.feedbackSpeedDegS.toFixed(6)} deg/s · muestras_por_grado=${(derived.st.samplesPerDeg ?? 0).toFixed(3)}`
        : "velocidad_feedback=no_disponible",
    ];
    return buildProcCsv(rows, rate, statsTxt, captureMetadataRef.current, calibrationRef.current);
  };

  const extendedPassAveragesCsv = (pass: ExtendedPassResult): string | null => {
    const factor = Math.max(1, Math.floor(avgFactor));
    const length = Math.min(pass.samples.anglesDeg.length, pass.samples.currentA.length);
    const groups = Math.floor(length / factor);
    if (!groups) return null;
    const lines = [
      `# pasada=${pass.label}`,
      `# promedio_bloque=${factor}`,
      "# std: desviación típica muestral dentro del bloque; sem: incertidumbre estándar de la media",
      "angle_mean_deg,angle_std_deg,angle_sem_deg,amps_mean,amps_std,amps_sem,n_group",
    ];
    for (let group = 0; group < groups; group++) {
      const start = group * factor;
      const angles = pass.samples.anglesDeg.slice(start, start + factor);
      const currents = pass.samples.currentA.slice(start, start + factor);
      const angleMean = mean(angles);
      const currentMean = mean(currents);
      const angleStd = factor > 1 ? std(angles) : 0;
      const currentStd = factor > 1 ? std(currents) : 0;
      lines.push([
        angleMean.toFixed(9), angleStd.toFixed(9), (angleStd / Math.sqrt(factor)).toFixed(9),
        currentMean.toFixed(9), currentStd.toFixed(9), (currentStd / Math.sqrt(factor)).toFixed(9), factor,
      ].join(","));
    }
    return `${lines.join("\n")}\n`;
  };

  const extendedMeanProfileCsv = (analysis: ExtendedAnalysis): string | null => {
    const moving = analysis.passes.filter((pass) => pass.direction !== "stationary" && pass.profile?.currentA?.length);
    if (!moving.length) return null;
    const lines = [
      "# promedio angular entre las series móviles del test extendido",
      "# std: dispersión entre series; sem: incertidumbre estándar de la media entre series",
      "angle_deg,amps_mean,amps_std,amps_sem,n_series",
    ];
    for (let bin = 0; bin < 360; bin++) {
      const values = moving.flatMap((pass) => {
        const value = pass.profile?.currentA[bin];
        return value === null || value === undefined || !Number.isFinite(value) ? [] : [value];
      });
      if (!values.length) continue;
      const sd = values.length > 1 ? std(values) : 0;
      lines.push(`${(bin + 0.5).toFixed(1)},${mean(values).toFixed(9)},${sd.toFixed(9)},${(sd / Math.sqrt(values.length)).toFixed(9)},${values.length}`);
    }
    return `${lines.join("\n")}\n`;
  };

  const summaryText = (axis: string, isExtended: boolean): string => {
    const metadata = captureMetadataRef.current;
    const lines = [
      "NEQ6 · RESUMEN DEL ENSAYO",
      "==========================",
      `Generado: ${new Date().toISOString()}`,
      `Tipo: ${isExtended ? "test extendido" : "test básico"}`,
      `Eje: ${axis}`,
      `Sentido de la última captura: ${metadata.direction?.toUpperCase() ?? "sin movimiento"}`,
      `Calibración ADC: R=${calibrationRef.current.shuntOhm} Ω · K=${calibrationRef.current.k}`,
      `Promedio seleccionado: bloques de ${Math.max(1, Math.floor(avgFactor))} muestra(s)`,
      "",
    ];
    if (!isExtended && derived) {
      lines.push(
        "ESTADÍSTICAS BÁSICAS",
        "--------------------",
        `Muestras: ${derived.st.n}`,
        `Duración: ${derived.st.durS.toFixed(3)} s`,
        `Tasa ADC efectiva: ${derived.st.rateEst.toFixed(3)} Hz`,
        `Corriente media: ${derived.st.mean.toFixed(6)} ± ${derived.st.sem.toFixed(6)} A`,
        `Desviación típica: ${derived.st.sd.toFixed(6)} A`,
        `Mediana: ${derived.st.median.toFixed(6)} A`,
        `Máximo: ${derived.st.maxA.toFixed(6)} A${derived.st.maxAngleDeg === null ? "" : ` a ${derived.st.maxAngleDeg.toFixed(3)}°`}`,
        `Recorrido con feedback: ${derived.st.angleSpanDeg.toFixed(3)}°`,
        `Velocidad de feedback: ${derived.st.feedbackSpeedDegS?.toFixed(6) ?? "no disponible"} °/s`,
        `Muestras por grado: ${derived.st.samplesPerDeg?.toFixed(3) ?? "no disponible"}`,
        "",
        "ESTADÍSTICA CIRCULAR",
        "--------------------",
        derived.st.circ
          ? `Dirección de carga: ${derived.st.circ.meanDeg.toFixed(3)}° · R̄=${derived.st.circ.R.toFixed(6)} · σ=${derived.st.circ.stdDeg.toFixed(3)}°`
          : "No disponible",
        "",
        "FFT · PICOS AUTOMÁTICOS",
        "-----------------------",
      );
      if (derived.peaks.length) {
        for (const peak of derived.peaks) {
          const mountDeg = derived.st.feedbackSpeedDegS ? peak.period * derived.st.feedbackSpeedDegS : null;
          lines.push(`${peak.freq.toFixed(6)} Hz · periodo ${peak.period.toFixed(6)} s${mountDeg === null ? "" : ` · cada ${mountDeg.toFixed(6)}°`}`);
        }
      } else lines.push("No disponible");
    }
    if (isExtended && extendedAnalysis) {
      lines.push("ESTADÍSTICAS POR FASE", "---------------------");
      for (const pass of extendedAnalysis.passes) {
        const st = pass.statistics;
        lines.push(
          "",
          `[${pass.label}]`,
          `N=${st.n} · duración=${st.durationS.toFixed(3)} s · ADC=${st.effectiveRateHz.toFixed(3)} Hz`,
          `I media=${st.meanA.toFixed(6)} ± ${st.semA.toFixed(6)} A · σ=${st.sdA.toFixed(6)} A · mediana=${st.medianA.toFixed(6)} A`,
          `máximo=${st.maxA.toFixed(6)} A${st.maxAngleDeg === null ? "" : ` a ${st.maxAngleDeg.toFixed(3)}°`} · velocidad=${st.measuredSpeedDegS?.toFixed(6) ?? "n/a"} °/s`,
        );
      }
      const mechanical = extendedAnalysis.groups.filter((group) => group.classification === "mecánica" || group.classification === "tren motor");
      lines.push("", "FRECUENCIAS MECÁNICAS / TREN MOTOR", "-----------------------------------");
      if (mechanical.length) {
        for (const group of mechanical) lines.push(
          `${group.representativeHz.toFixed(6)} Hz · ${group.representativeDeg?.toFixed(6) ?? "n/a"}° · ${group.classification} · ${group.reason}`,
        );
      } else lines.push("No se clasificaron frecuencias mecánicas con evidencia suficiente.");
      lines.push("", "CLASIFICACIÓN FFT COMPLETA", "--------------------------");
      for (const group of extendedAnalysis.groups) lines.push(
        `${group.representativeHz.toFixed(6)} Hz · ${group.representativeDeg?.toFixed(6) ?? "n/a"}° · ${group.classification} · pasadas: ${group.passes.join(" | ")}`,
      );
    }
    lines.push("", "Nota: la clasificación espectral es una inferencia comparativa, no identifica por sí sola una pieza mecánica concreta.", "");
    return lines.join("\n");
  };

  const exportRaw = () => {
    if (!adcRef.current.length) {
      setNotice("No hay muestras que exportar.");
      return;
    }
    download(`neq6-raw-${stamp()}.csv`, rawCsvText());
  };

  const exportProc = () => {
    if (!derived) {
      setNotice("No hay datos procesados que exportar.");
      return;
    }
    if (!derived.plot) {
      setNotice("No hay muestras con ángulo para el CSV procesado.");
      return;
    }
    download(`neq6-proc-${stamp()}.csv`, processedCsvText()!);
  };

  const exportBundle = async (extraFiles: { name: string; data: string | Uint8Array }[] = []) => {
    if (!derived || !adcRef.current.length) {
      setNotice("No hay datos que exportar.");
      return;
    }
    const axis = captureMetadataRef.current.axis === 1 ? "AR" : captureMetadataRef.current.axis === 2 ? "DEC" : "eje-desconocido";
    const isExtended = Boolean(extendedAnalysis?.passes.length);
    const testLabel = isExtended ? "test-extendido" : "test-basico";
    const root = `NEQ6_${axis}_${testLabel}_${stamp()}`;
    const files: { name: string; data: string | Uint8Array }[] = [];
    if (isExtended) {
      files.push(...extendedFilesRef.current.map((file) => ({ name: `${root}/medidas/${file.name}`, data: file.data })));
    } else {
      files.push({ name: `${root}/medidas/medidas.csv`, data: measurementCsvText("basic") });
    }
    const processed = processedCsvText();
    if (!isExtended && processed) files.push({ name: `${root}/datos-promediados/promedios.csv`, data: processed });
    if (!isExtended && derived.mag) {
      const speed = derived.st.feedbackSpeedDegS;
      const direction = captureMetadataRef.current.direction?.toUpperCase() ?? "unknown";
      let fftCsv = `# axis=${axis}\n# direction=${direction}\nbin,frequency_hz,period_s,period_mount_deg,magnitude\n`;
      for (let i = 1; i < derived.mag.length; i++) {
        const frequency = i * derived.df;
        const period = 1 / frequency;
        fftCsv += `${i},${frequency.toFixed(9)},${period.toFixed(9)},${speed ? (period * speed).toFixed(9) : ""},${derived.mag[i].toExponential(9)}\n`;
      }
      files.push({ name: `${root}/fft/espectro.csv`, data: fftCsv });
    }
    if (extendedAnalysis) {
      for (const pass of extendedAnalysis.passes) {
        const passAverages = extendedPassAveragesCsv(pass);
        if (passAverages) files.push({ name: `${root}/datos-promediados/${pass.id}.csv`, data: passAverages });
        if (!pass.spectrum) continue;
        let csv = `# pasada=${pass.label}\n# eje=${axis}\n# sentido=${pass.direction.toUpperCase()}\nfrequency_hz,period_s,period_mount_deg,magnitude\n`;
        for (let i = 1; i < pass.spectrum.magnitude.length; i++) {
          const frequency = i * pass.spectrum.dfHz;
          csv += `${frequency.toFixed(9)},${(1 / frequency).toFixed(9)},${pass.measuredSpeedDegS ? (pass.measuredSpeedDegS / frequency).toFixed(9) : ""},${pass.spectrum.magnitude[i].toExponential(9)}\n`;
        }
        files.push({ name: `${root}/fft/espectro-${pass.id}.csv`, data: csv });
        pass.revolutionSpectra?.forEach((spectrum, revolutionIndex) => {
          let revolutionCsv = `# pasada=${pass.label}\n# revolucion=${revolutionIndex + 1}\nfrequency_hz,period_s,period_mount_deg,magnitude\n`;
          for (let i = 1; i < spectrum.magnitude.length; i++) {
            const frequency = i * spectrum.dfHz;
            revolutionCsv += `${frequency.toFixed(9)},${(1 / frequency).toFixed(9)},${pass.measuredSpeedDegS ? (pass.measuredSpeedDegS / frequency).toFixed(9) : ""},${spectrum.magnitude[i].toExponential(9)}\n`;
          }
          files.push({ name: `${root}/fft/revoluciones/${pass.id}-rev-${revolutionIndex + 1}.csv`, data: revolutionCsv });
        });
      }
      const movingSpectra = extendedAnalysis.passes.filter((pass) => pass.direction !== "stationary" && pass.spectrum).map((pass) => pass.spectrum!);
      const averageSpectrum = averageFftSpectra(movingSpectra.length ? movingSpectra : extendedAnalysis.passes.flatMap((pass) => pass.spectrum ? [pass.spectrum] : []));
      if (averageSpectrum) {
        let csv = "# promedio interpolado de todos los espectros del test extendido\nfrequency_hz,period_s,magnitude\n";
        for (let i = 1; i < averageSpectrum.magnitude.length; i++) {
          const frequency = i * averageSpectrum.dfHz;
          csv += `${frequency.toFixed(9)},${(1 / frequency).toFixed(9)},${averageSpectrum.magnitude[i].toExponential(9)}\n`;
        }
        files.push({ name: `${root}/fft/espectro-promedio.csv`, data: csv });
      }
      let comparison = "grupo,clasificacion,frecuencia_hz,periodicidad_grados,pasadas,armonico_de_hz,evidencia\n";
      for (const group of extendedAnalysis.groups) comparison += `${group.id},${group.classification},${group.representativeHz.toFixed(9)},${group.representativeDeg?.toFixed(9) ?? ""},\"${group.passes.join(" | ")}\",${group.harmonicOfHz?.toFixed(9) ?? ""},\"${group.reason.replace(/"/g, '""')}\"\n`;
      files.push({ name: `${root}/fft/analisis-comparativo.csv`, data: comparison });
      const meanProfile = extendedMeanProfileCsv(extendedAnalysis);
      if (meanProfile) files.push({ name: `${root}/datos-promediados/promedio-series.csv`, data: meanProfile });
    }
    files.push({ name: `${root}/resumen-estadisticas-y-fft.txt`, data: summaryText(axis, isExtended) });
    files.push(...extraFiles.map((file) => ({ name: `${root}/${file.name.replace(/^datos\//, "fft/")}`, data: file.data })));
    downloadBlob(`${root}.zip`, buildZip(files));
    setNotice("Exportación preparada: medidas sin agrupar, gráficas y análisis FFT.");
  };

  const exportSavedSessions = async () => {
    if (!sessions.length) return;
    const files = sessions.flatMap((session) => {
      const safeName = session.name.replace(/[^a-z0-9_-]+/gi, "_");
      const samples = session.adc.map((adc, index) => ({ tb: session.tb[index], ts: session.ts[index], adc }));
      const axis = session.metadata?.axis === 1 ? "AR" : session.metadata?.axis === 2 ? "DEC" : "eje-desconocido";
      const kind = session.extendedAnalysis?.passes.length ? "test-extendido" : "test-basico";
      const angles = session.angleTb.map((tb, index) => ({ tb, deg: session.angleDeg[index] }));
      const base = `sesiones/${safeName}_${axis}_${kind}`;
      const archivedMeasurements = session.extendedFiles?.filter((file) => file.name.endsWith("-medidas.csv")) ?? [];
      const result: { name: string; data: string }[] = kind === "test-extendido" && archivedMeasurements.length
        ? archivedMeasurements.map((file) => ({ name: `${base}/medidas/${file.name.split("/").pop()}`, data: file.data }))
        : [{ name: `${base}/medidas.csv`, data: buildMeasurementCsv(samples, angles, session.metadata, session.calibration, kind === "test-extendido" ? "extended" : "basic") }];
      if (session.extendedAnalysis) {
        for (const pass of session.extendedAnalysis.passes) {
          if (!pass.spectrum) continue;
          let csv = `# pasada=${pass.label}\nfrequency_hz,period_s,period_mount_deg,magnitude\n`;
          for (let i = 1; i < pass.spectrum.magnitude.length; i++) {
            const frequency = i * pass.spectrum.dfHz;
            csv += `${frequency.toFixed(9)},${(1 / frequency).toFixed(9)},${pass.measuredSpeedDegS ? (pass.measuredSpeedDegS / frequency).toFixed(9) : ""},${pass.spectrum.magnitude[i].toExponential(9)}\n`;
          }
          result.push({ name: `${base}/fft/espectro-${pass.id}.csv`, data: csv });
        }
        let comparison = "grupo,clasificacion,frecuencia_hz,periodicidad_grados,pasadas,evidencia\n";
        for (const group of session.extendedAnalysis.groups) comparison += `${group.id},${group.classification},${group.representativeHz.toFixed(9)},${group.representativeDeg?.toFixed(9) ?? ""},\"${group.passes.join(" | ")}\",\"${group.reason.replace(/"/g, '""')}\"\n`;
        result.push({ name: `${base}/fft/analisis-comparativo.csv`, data: comparison });
      }
      return result;
    });
    downloadBlob(`neq6-sesiones-${stamp()}.zip`, buildZip(files));
    setNotice(`${sessions.length} sesiones exportadas.`);
  };

  const importCsv = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (!parsed || !parsed.samples.length) {
      setNotice("CSV no reconocido: se necesitan columnas ts_us y adc_raw.");
      return;
    }
    tbRef.current = parsed.samples.map((s) => s.tb);
    tsRef.current = parsed.samples.map((s) => s.ts);
    adcRef.current = parsed.samples.map((s) => s.adc);
    angleRef.current = parsed.angles;
    setCaptureMetadata(parsed.metadata);
    setCalibration(parsed.calibration);
    setVersion((v) => v + 1);
    setNotice(
      `Importadas ${parsed.samples.length.toLocaleString("es-ES")} muestras (${parsed.processed ? "CSV procesado" : "CSV crudo"})` +
        (parsed.angles.length ? ` · ${parsed.angles.length.toLocaleString("es-ES")} ángulos.` : "."),
    );
  };

  const saveSession = async () => {
    if (!adcRef.current.length) {
      setNotice("No hay muestras que guardar.");
      return;
    }
    const s: Session = {
      id: crypto.randomUUID(),
      name: `captura-${stamp()}`,
      createdAt: Date.now(),
      rateHz: rate,
      tb: [...tbRef.current],
      ts: [...tsRef.current],
      adc: [...adcRef.current],
      angleTb: angleRef.current.map((a) => a.tb),
      angleDeg: angleRef.current.map((a) => a.deg),
      metadata: { ...captureMetadataRef.current },
      calibration: { ...calibrationRef.current },
      extendedAnalysis,
      extendedFiles: extendedFilesRef.current.map((file) => ({ ...file })),
    };
    await idb.save(s);
    setSessions(await idb.list());
    setNotice("Sesión guardada en IndexedDB.");
  };

  const loadSession = (s: Session) => {
    tbRef.current = [...s.tb];
    tsRef.current = [...s.ts];
    adcRef.current = [...s.adc];
    angleRef.current = s.angleTb.map((tb, i) => ({ tb, deg: s.angleDeg[i] }));
    setCaptureMetadata(s.metadata ?? { ...EMPTY_CAPTURE_METADATA });
    if (s.calibration) setCalibration(s.calibration);
    setExtendedAnalysis(s.extendedAnalysis ?? null);
    extendedFilesRef.current = s.extendedFiles?.map((file) => ({ ...file })) ?? [];
    setRate(s.rateHz);
    setVersion((v) => v + 1);
    setNotice(`Sesión «${s.name}» cargada.`);
  };

  const deleteSession = async (id: string) => {
    await idb.remove(id);
    setSessions(await idb.list());
  };

  const clearData = () => {
    tbRef.current = [];
    tsRef.current = [];
    adcRef.current = [];
    angleRef.current = [];
    sampleClockOffsetRef.current = null;
    setCaptureMetadata({ ...EMPTY_CAPTURE_METADATA });
    setVersion((v) => v + 1);
    setNotice(null);
  };

  const n = adcRef.current.length;
  const lastA = n ? adcToAmps(adcRef.current[n - 1], calibration) : 0;
  let rmsHalfSecond = 0;
  if (n) {
    const cutoffUs = tsRef.current[n - 1] - 500_000;
    let start = n - 1;
    while (start > 0 && tsRef.current[start - 1] >= cutoffUs) start--;
    let sumSquares = 0;
    for (let i = start; i < n; i++) {
      const amps = adcToAmps(adcRef.current[i], calibration);
      sumSquares += amps * amps;
    }
    rmsHalfSecond = Math.sqrt(sumSquares / (n - start));
  }

  return {
    ble,
    usb,
    transport,
    connected,
    sync,
    syncing,
    doSync,
    rate,
    setRate,
    capturing,
    startCapture,
    stopCapture,
    angleOn,
    setAngleOn,
    stats: { n, lastA, rmsHalfSecond, revs: derived?.nRevs ?? 0 },
    buffers: { tbRef, tsRef, adcRef, angleRef },
    derived,
    avgFactor,
    setAvgFactor,
    overlayRevs,
    setOverlayRevs,
    recalc: () => setVersion((v) => v + 1),
    notice,
    deviceInfo,
    sessions,
    makeSamples,
    exportRaw,
    exportProc,
    exportBundle,
    exportSavedSessions,
    importCsv,
    saveSession,
    loadSession,
    deleteSession,
    clearData,
    recordAngle,
    captureMetadata,
    setCaptureMetadata,
    calibration,
    setCalibration,
    adcToAmps: (raw: number) => adcToAmps(raw, calibrationRef.current),
    extendedAnalysis,
    setExtendedAnalysis,
    snapshotExtendedPass,
    resetExtendedArchive,
    archiveExtendedPass,
    consoleLines,
    clearConsole: () => setConsoleLines([]),
    sendConsoleCommand: (command: string) => sendCmd(command.trim()),
    tick,
  };
}

export type FlipperApi = ReturnType<typeof useFlipper>;
