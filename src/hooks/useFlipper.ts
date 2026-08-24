import { useEffect, useMemo, useRef, useState } from "react";
import { useBle } from "./useBle";
import { useFlipperSerial } from "./useFlipperSerial";
import {
  adcToAmps,
  angleAt,
  binCartesian,
  binPolar,
  buildProcCsv,
  buildRawCsv,
  circularStats,
  fftMag,
  idb,
  mean,
  median,
  parseCsv,
  resampleUniform,
  std,
  topPeaks,
  unwrapDegrees,
  type AnglePoint,
  type Sample,
  type Session,
} from "../lib/flipper";

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
  const [sessions, setSessions] = useState<Session[]>([]);

  const pendingLineRef = useRef<((line: string) => void) | null>(null);
  const commandQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const captureGenerationRef = useRef(0);
  const capturingRef = useRef(false);
  const syncRef = useRef(sync);
  syncRef.current = sync;

  const onSamples = (batch: Sample[]) => {
    const tb = tbRef.current;
    const ts = tsRef.current;
    const adc = adcRef.current;
    const clock = syncRef.current;
    for (const s of batch) {
      /* Fecha real de adquisición, no fecha de llegada del paquete BLE/USB. */
      tb.push(clock ? s.ts / 1000 - clock.offsetMs : s.tb);
      ts.push(s.ts);
      adc.push(s.adc);
    }
    if (tb.length > MAX_SAMPLES) {
      void stopCapture(false);
      setNotice(
        `Buffer lleno (${MAX_SAMPLES.toLocaleString("es-ES")} muestras) — captura detenida. Exporta o guarda la sesión.`,
      );
    }
  };

  const onLine = (line: string) => {
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
    setRate(requestedRate);
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
    if (connected) await sendCmd("STOP", 700);
    if (bump) setVersion((v) => v + 1);
  };

  useEffect(() => {
    if (!capturing) return;
    const iv = window.setInterval(() => setTick((t) => t + 1), 300);
    return () => window.clearInterval(iv);
  }, [capturing]);

  const recordAngle = (deg: number, tb = Date.now()) => {
    if (!capturingRef.current || !angleOn) return;
    angleRef.current.push({ tb, deg: ((deg % 360) + 360) % 360 });
  };

  useEffect(() => {
    void idb.list().then(setSessions).catch(() => setSessions([]));
  }, []);

  /* ── derivadas (procesado no destructivo) ────────────── */
  const derived = useMemo(() => {
    const n = adcRef.current.length;
    if (!n) return null;
    const amps = new Float64Array(n);
    for (let i = 0; i < n; i++) amps[i] = adcToAmps(adcRef.current[i]);

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
        let prevK = Math.floor(perUnw[0] / 360);
        const k0 = prevK;
        for (let i = 0; i < n; i++) {
          const u = perUnw[i];
          const k = isNaN(u) ? prevK : Math.floor(u / 360);
          if (k !== prevK) {
            revTimes.push(tbRef.current[i]);
            prevK = k;
          }
          revOf[i] = k - k0;
        }
        nRevs = Math.max(0, prevK - k0);
      }
    }

    const m = Math.max(1, Math.min(avgFactor, n));
    const avgA: number[] = [];
    for (let i = 0; i + m <= n; i += m) {
      let s = 0;
      for (let j = 0; j < m; j++) s += amps[i + j];
      avgA.push(s / m);
    }

    const angles: number[] = [];
    const currents: number[] = [];
    if (perUnw && revOf) {
      for (let i = 0; i < n; i++)
        if (!isNaN(perUnw[i])) {
          angles.push(perUnw[i]);
          currents.push(amps[i]);
        }
    }
    const polarAvg = angles.length ? binPolar(angles, currents) : null;
    const cart = angles.length ? binCartesian(angles, currents) : null;

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
      circ: angles.length ? circularStats(angles) : null,
      dThetaEnc: cpr1 ? 360 / cpr1 : null,
      maxA: 0,
    };
    let mx = 0;
    for (let i = 0; i < n; i++) if (amps[i] > mx) mx = amps[i];
    st.maxA = mx;

    return {
      amps,
      perUnw,
      revOf,
      revTimes,
      nRevs,
      avgA,
      polarAvg,
      cart,
      mag,
      peaks,
      df: D > 0 ? 1 / D : 0,
      st,
      hasAngle: angles.length > 0,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, avgFactor, cpr1, tick]);

  const revPolars = useMemo(() => {
    if (!derived?.revOf || !overlayRevs) return null;
    const groups = new Map<number, { a: number[]; c: number[] }>();
    const { revOf, perUnw, amps } = derived;
    for (let i = 0; i < revOf.length; i++) {
      const u = perUnw![i];
      if (isNaN(u)) continue;
      const k = revOf[i];
      if (k < 0) continue;
      let g = groups.get(k);
      if (!g) {
        g = { a: [], c: [] };
        groups.set(k, g);
      }
      g.a.push(u);
      g.c.push(amps[i]);
    }
    return [...groups.entries()]
      .sort((x, y) => x[0] - y[0])
      .map(([k, g]) => ({ k, bins: binPolar(g.a, g.c) }));
  }, [derived, overlayRevs]);

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

  const exportRaw = () => {
    if (!adcRef.current.length) {
      setNotice("No hay muestras que exportar.");
      return;
    }
    download(`neq6-raw-${stamp()}.csv`, buildRawCsv(makeSamples(), rate));
  };

  const exportProc = () => {
    if (!derived) {
      setNotice("No hay datos procesados que exportar.");
      return;
    }
    const rows = makeSamples().map((s, i) => ({
      ...s,
      amps: adcToAmps(s.adc),
      unw: derived.perUnw && !isNaN(derived.perUnw[i]) ? derived.perUnw[i] : null,
      rev: derived.revOf ? derived.revOf[i] : null,
    }));
    const statsTxt = [
      `media=${derived.st.mean.toFixed(6)} A · mediana=${derived.st.median.toFixed(6)} A · σ=${derived.st.sd.toFixed(6)} A`,
      `σ_media=${derived.st.sem.toExponential(3)} A · N=${derived.st.n} · factor=${avgFactor}`,
    ];
    download(`neq6-proc-${stamp()}.csv`, buildProcCsv(rows, rate, statsTxt));
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
    angleRef.current = [];
    setVersion((v) => v + 1);
    setNotice(`Importadas ${parsed.samples.length.toLocaleString("es-ES")} muestras (${parsed.processed ? "CSV procesado" : "CSV crudo"}).`);
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
    setVersion((v) => v + 1);
    setNotice(null);
  };

  const n = adcRef.current.length;
  const lastA = n ? adcToAmps(adcRef.current[n - 1]) : 0;

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
    stats: { n, lastA, revs: derived?.nRevs ?? 0 },
    buffers: { tbRef, tsRef, adcRef, angleRef },
    derived,
    revPolars,
    avgFactor,
    setAvgFactor,
    overlayRevs,
    setOverlayRevs,
    recalc: () => setVersion((v) => v + 1),
    notice,
    sessions,
    makeSamples,
    exportRaw,
    exportProc,
    importCsv,
    saveSession,
    loadSession,
    deleteSession,
    clearData,
    recordAngle,
    tick,
  };
}

export type FlipperApi = ReturnType<typeof useFlipper>;
