import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FlipperApi } from "../hooks/useFlipper";
import { averageAngularSeriesSpectrum, averageFftSpectra, circularStats, fitPolarEllipse, movingWindowStats, topPeaks, travelFromCaptureOrigin } from "../lib/flipper";
import { IconAlert, IconDownload, IconTrash, IconZoom } from "./icons";
import AiAnalysisPanel from "./AiAnalysisPanel";
import { analysisFingerprint, getAiResponse, saveAiResponse, useAiResponseVersion, useAiSettings } from "../hooks/useAiAnalysis";

const AVGS = [1, 2, 5, 10, 20, 50, 100];
const REV_COLORS = [
  "#f5a524", "#4cc9f0", "#45e08b", "#ff6b9d", "#b892ff",
  "#ff7d5c", "#68d8d6", "#e7e247", "#8fb8ff", "#f29cff",
];
const renderStride = (length: number, pixelWidth: number, pointsPerPixel = 3) =>
  Math.max(1, Math.ceil(length / Math.max(600, pixelWidth * pointsPerPixel)));

type View = "vivo" | "polar" | "cartesiano" | "fft" | "stats" | "ai";
type Peak = { bin: number; freq: number; period: number; mag: number };
/** Fracción visible de los dominios completos X/Y. Es el equivalente a
 * set_xlim/set_ylim: los dibujantes vuelven a proyectar los datos, no se
 * recorta una imagen de la gráfica. */
type ChartViewport = { x0: number; x1: number; y0: number; y1: number };
const RESET_VIEWPORT: ChartViewport = { x0: 0, x1: 1, y0: 0, y1: 1 };
type ChartDraw = (ctx: CanvasRenderingContext2D, w: number, h: number, viewport?: ChartViewport) => void;

const VIEWS: { id: View; label: string }[] = [
  { id: "vivo", label: "Vivo" },
  { id: "polar", label: "Polar" },
  { id: "cartesiano", label: "Cartesiano" },
  { id: "fft", label: "FFT" },
  { id: "stats", label: "Estadísticas" },
];

function ChartCanvas({
  draw,
  className,
  viewport,
  onViewport,
  onPick,
  onCursor,
  onCursorLeave,
  cursorLabel,
  regionZoom,
  onRegionZoomDone,
  renderToken,
}: {
  draw: ChartDraw;
  className: string;
  viewport: ChartViewport;
  onViewport: (next: ChartViewport) => void;
  onPick?: (x: number, y: number, clientX: number, clientY: number) => void;
  onCursor?: (x: number, y: number, width: number, height: number) => void;
  onCursorLeave?: () => void;
  cursorLabel?: string;
  regionZoom: boolean;
  onRegionZoomDone: () => void;
  renderToken: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const drag = useRef<{ x: number; y: number; viewport: ChartViewport; moved: boolean; mode: "pan" | "region" | "pick" } | null>(null);
  const [selection, setSelection] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.parentElement) return;
    const parent = cv.parentElement;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      drawRef.current(ctx, w, h, viewport);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => ro.disconnect();
  }, [renderToken, viewport]);
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.button !== 2) return;
    const mode = event.button === 2 ? "pan" : regionZoom ? "region" : "pick";
    if (mode === "pan") event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, viewport, moved: false, mode };
    if (mode === "region") {
      const rect = event.currentTarget.getBoundingClientRect();
      setSelection({ x0: event.clientX - rect.left, y0: event.clientY - rect.top, x1: event.clientX - rect.left, y1: event.clientY - rect.top });
    }
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onCursor?.(
      event.clientX - rect.left,
      event.clientY - rect.top,
      rect.width,
      rect.height,
    );
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
    if (drag.current.mode === "pan") {
      const spanX = drag.current.viewport.x1 - drag.current.viewport.x0;
      const spanY = drag.current.viewport.y1 - drag.current.viewport.y0;
      const rect = event.currentTarget.getBoundingClientRect();
      const x0 = Math.min(1 - spanX, Math.max(0, drag.current.viewport.x0 - (dx / rect.width) * spanX));
      const y0 = Math.min(1 - spanY, Math.max(0, drag.current.viewport.y0 - (dy / rect.height) * spanY));
      onViewport({ x0, x1: x0 + spanX, y0, y1: y0 + spanY });
    }
    if (drag.current.mode === "region") {
      const rect = event.currentTarget.getBoundingClientRect();
      setSelection((current) => current ? { ...current, x1: event.clientX - rect.left, y1: event.clientY - rect.top } : current);
    }
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    if (state?.mode === "region" && selection) {
      const width = Math.abs(selection.x1 - selection.x0);
      const height = Math.abs(selection.y1 - selection.y0);
      const rect = event.currentTarget.getBoundingClientRect();
      if (width > 8 && height > 8) {
        const sx0 = Math.min(selection.x0, selection.x1) / rect.width;
        const sx1 = Math.max(selection.x0, selection.x1) / rect.width;
        const sy0 = Math.min(selection.y0, selection.y1) / rect.height;
        const sy1 = Math.max(selection.y0, selection.y1) / rect.height;
        const spanX = viewport.x1 - viewport.x0;
        const spanY = viewport.y1 - viewport.y0;
        onViewport({
          x0: viewport.x0 + sx0 * spanX,
          x1: viewport.x0 + sx1 * spanX,
          y0: viewport.y0 + sy0 * spanY,
          y1: viewport.y0 + sy1 * spanY,
        });
      }
      setSelection(null);
      onRegionZoomDone();
    } else if (state?.mode === "pick" && !state.moved && onPick) {
      const rect = event.currentTarget.getBoundingClientRect();
      onPick(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
        event.clientX,
        event.clientY,
      );
    }
    drag.current = null;
  };
  const wheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const parentRect = event.currentTarget.parentElement!.getBoundingClientRect();
    const px = event.clientX - parentRect.left;
    const py = event.clientY - parentRect.top;
    const zoomIn = event.deltaY < 0;
    const factor = zoomIn ? 1 / 1.18 : 1.18;
    const spanX = Math.min(1, (viewport.x1 - viewport.x0) * factor);
    const spanY = Math.min(1, (viewport.y1 - viewport.y0) * factor);
    const fx = px / parentRect.width;
    const fy = py / parentRect.height;
    const focusX = viewport.x0 + fx * (viewport.x1 - viewport.x0);
    const focusY = viewport.y0 + fy * (viewport.y1 - viewport.y0);
    const x0 = Math.min(1 - spanX, Math.max(0, focusX - fx * spanX));
    const y0 = Math.min(1 - spanY, Math.max(0, focusY - fy * spanY));
    onViewport({ x0, x1: x0 + spanX, y0, y1: y0 + spanY });
  };
  return (
    <div className={`relative w-full overflow-hidden rounded border border-line bg-[#081120] ${className}`}>
      <canvas
        ref={ref}
        className={`block touch-none ${regionZoom ? "cursor-crosshair" : onPick ? "cursor-crosshair" : "cursor-default"}`}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => (drag.current = null)}
        onPointerLeave={onCursorLeave}
        onWheel={wheel}
        onContextMenu={(event) => event.preventDefault()}
      />
      {cursorLabel && (
        <output className="pointer-events-none absolute right-2 top-2 rounded border border-line bg-[#081120]/90 px-1.5 py-1 font-mono text-[9px] tabular-nums text-fog">
          {cursorLabel}
        </output>
      )}
      {selection && (
        <div
          className="pointer-events-none absolute border border-ion bg-ion/10"
          style={{ left: Math.min(selection.x0, selection.x1), top: Math.min(selection.y0, selection.y1), width: Math.abs(selection.x1 - selection.x0), height: Math.abs(selection.y1 - selection.y0) }}
        />
      )}
    </div>
  );
}

const STAT_HELP: Record<string, string> = {
  "N (crudo / promediado)": "Número de muestras ADC originales y número de puntos resultantes después de aplicar la media móvil ×N.",
  "tiempo real adquisición": "Duración calculada con los timestamps monotónicos del Flipper.",
  "tasa ADC efectiva": "Frecuencia realmente recibida: (N−1) dividido por la duración.",
  "sincronización reloj": "Desfase, jitter y tiempo de ida/vuelta entre el reloj del navegador y el Flipper.",
  "velocidad medida (:j)": "Mediana de los desplazamientos del contador :j divididos por su intervalo real.",
  "muestras / grado medidas": "Muestras ADC que pudieron interpolarse entre anclas :j, divididas por el recorrido confirmado.",
  "recorrido confirmado :j": "Ángulo acumulado calculado exclusivamente con posiciones devueltas por la montura.",
  "media móvil": "Ventana deslizante de N muestras consecutivas. Cada nueva muestra genera un punto nuevo; las barras usan un tamaño efectivo corregido por la autocorrelación local.",
  "media ± σ": "Promedio aritmético y desviación típica de la corriente: describe el nivel central y la dispersión de las medidas.",
  "media ± SEM": "Promedio e incertidumbre estadística de esa media (σ/√N). No representa la dispersión de las muestras individuales.",
  mediana: "Valor central de la corriente; es menos sensible a picos aislados.",
  "pico máximo / posición": "Mayor muestra instantánea y ángulo interpolado donde apareció.",
  "sector 10° de mayor media": "Entre las 36 secciones angulares, la de corriente media más alta.",
  "sector 10° de menor media": "Entre las 36 secciones angulares, la de corriente media más baja.",
  "zona sobre la media": "Región angular continua donde el perfil suavizado permanece por encima de la corriente media global.",
  "dirección de carga circular": "Dirección del vector resultante al ponderar cada ángulo por su corriente. Sólo es representativa cuando R̄ no es baja.",
  "concentración R̄": "Asimetría angular de la carga entre 0 y 1. Cerca de 0: carga uniforme o sectores opuestos que se cancelan; cerca de 1: concentrada en una dirección.",
  "dispersión circular σ": "Dispersión angular equivalente derivada de R̄. Si R̄ está cerca de cero, tanto σ como la dirección media son poco informativas.",
  "δθ encoder (360/CPR)": "Resolución teórica de una cuenta del controlador; no equivale a precisión mecánica.",
  "elipse · semiejes a / b": "Semiejes mayor y menor del ajuste elíptico de la curva polar.",
  "elipse · cociente a/b": "Elongación de la elipse; 1 representa una circunferencia.",
  "elipse · inclinación φ": "Orientación angular del semieje mayor.",
  "elipse · centro x / y": "Desplazamiento cartesiano del centro respecto al origen polar.",
  "elipse · centro polar r / θ": "Módulo y dirección del desplazamiento del centro.",
  "elipse · excentricidad / RMS": "Forma de la elipse y residuo del ajuste; un RMS menor indica mejor ajuste.",
  "corriente media": "Promedio entre las vueltas del test extendido; el valor ± es la incertidumbre estándar entre vueltas.",
  "tasa ADC media": "Frecuencia efectiva media recibida por el Flipper; el valor ± es su incertidumbre entre pasadas.",
  "velocidad media": "Velocidad angular absoluta media medida con el feedback :j; el valor ± es su incertidumbre entre pasadas.",
  "concentración R̄ media": "Concentración angular media entre pasadas, de 0 (uniforme/cancelada) a 1 (una dirección dominante).",
  "dirección de carga media": "Dirección media del vector de carga ponderado por corriente; si R̄ es pequeña no es representativa.",
  "semieje a medio": "Semieje mayor medio del ajuste elíptico; ± expresa la variación entre pasadas.",
  "semieje b medio": "Semieje menor medio del ajuste elíptico; ± expresa la variación entre pasadas.",
  "cociente a/b medio": "Elongación media de la elipse; 1 equivale a una circunferencia.",
  "inclinación φ media": "Orientación media del semieje mayor de la elipse.",
};

function StatCell({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  const help = STAT_HELP[k]
    ?? (k.endsWith("media") ? "Valor medio entre las pasadas del test extendido; el valor ± asociado es la incertidumbre entre pasadas." : undefined)
    ?? (k.startsWith("Flipper ") ? "OOR cuenta lecturas fuera de rango y OVF pérdidas por desbordamiento del búfer." : undefined);
  return (
    <div title={help} className={`flex items-baseline justify-between gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5 ${help ? "cursor-help" : ""}`}>
      <span className="text-[8.5px] uppercase tracking-wider text-dim">{k}</span>
      <span className={`tabular-nums ${tone ?? "text-fog"}`}>{v}</span>
    </div>
  );
}

function StatSection({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded border border-line bg-[#091426]/70">
      <header className="border-b border-line bg-[#0c1930] px-2.5 py-2">
        <h3 className="font-display text-[9.5px] font-bold uppercase tracking-[0.16em] text-fog">{title}</h3>
        {subtitle && <p className="mt-0.5 font-mono text-[8.5px] text-dim">{subtitle}</p>}
      </header>
      <div className="grid grid-cols-1 gap-1.5 p-2 font-mono text-[10px] sm:grid-cols-2">{children}</div>
    </section>
  );
}

export default function FlipperLab({
  flip,
  serialOpen,
  canMoveToAngle,
  onMoveToAngle,
}: {
  flip: FlipperApi;
  serialOpen: boolean;
  canMoveToAngle: boolean;
  onMoveToAngle: (angle: number) => void;
}) {
  const [view, setView] = useState<View>("vivo");
  const [regionZoom, setRegionZoom] = useState(false);
  const [viewports, setViewports] = useState<Record<View, ChartViewport>>({
    vivo: RESET_VIEWPORT,
    polar: RESET_VIEWPORT,
    cartesiano: RESET_VIEWPORT,
    fft: RESET_VIEWPORT,
    stats: RESET_VIEWPORT,
    ai: RESET_VIEWPORT,
  });
  const [manualPeaksBySeries, setManualPeaksBySeries] = useState<Record<string, Peak[]>>({});
  const [hiddenExtendedSeries, setHiddenExtendedSeries] = useState<Set<string>>(() => new Set());
  const [showExtendedMean, setShowExtendedMean] = useState(true);
  const [selectedFftSeries, setSelectedFftSeries] = useState("average");
  const [overlayFftSeries, setOverlayFftSeries] = useState(false);
  const [movePrompt, setMovePrompt] = useState<{ angle: number; x: number; y: number } | null>(null);
  const [exportMenu, setExportMenu] = useState(false);
  const [cursorLabel, setCursorLabel] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const [aiSettings] = useAiSettings();
  const aiResponseVersion = useAiResponseVersion();
  const visibleViews = aiSettings.enabled ? [...VIEWS, { id: "ai" as const, label: "Análisis IA" }] : VIEWS;

  const { derived, stats } = flip;
  const n = stats.n;
  /* Sesiones guardadas antes de incorporar perfiles/estadísticas extendidas
   * siguen siendo cargables; sencillamente no se dibujan como multipasada. */
  const extendedPasses = useMemo(() => (flip.extendedAnalysis?.passes ?? []).filter((pass) => Boolean(pass.statistics)), [flip.extendedAnalysis]);
  const basicPasses = useMemo(() => derived?.basicPasses ?? [], [derived]);
  const comparisonPasses = useMemo(() => extendedPasses.length ? extendedPasses : basicPasses, [extendedPasses, basicPasses]);
  const isExtendedTest = extendedPasses.length > 0;
  const independentRevs = !flip.overlayRevs && !isExtendedTest && basicPasses.length > 1;
  const sequentialCartesian = independentRevs;
  const cartesianFullAngleDeg = sequentialCartesian ? basicPasses.length * 360 : 360;
  const sequenceOriginDeg = basicPasses[0]?.samples.anglesDeg[0]
    ?? (derived?.plot?.length ? derived.plot.angles[0] : 0);
  const cartesianAngle = (angle: number) => independentRevs
    ? travelFromCaptureOrigin(angle, sequenceOriginDeg)
    : ((angle % 360) + 360) % 360;
  const fftReferenceSpeed = useMemo(() => {
    const speeds = comparisonPasses
      .filter((pass) => pass.direction !== "stationary")
      .map((pass) => pass.measuredSpeedDegS)
      .filter((speed): speed is number => speed !== null && speed > 0);
    return speeds.length ? speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length : null;
  }, [comparisonPasses]);
  const extendedFftSeries = useMemo(() => {
    const passes = comparisonPasses.flatMap((pass, index) => pass.spectrum ? [{
      id: pass.id,
      label: pass.label,
      color: REV_COLORS[index % REV_COLORS.length],
      spectrum: pass.direction !== "stationary" && fftReferenceSpeed && pass.samples?.anglesDeg?.length
        ? averageAngularSeriesSpectrum([{
            anglesDeg: pass.samples.anglesDeg,
            currentA: pass.samples.currentA,
            speedDegS: pass.measuredSpeedDegS,
          }], fftReferenceSpeed) ?? pass.spectrum
        : pass.spectrum,
    }] : []);
    const movingSpectra = passes.filter((series) => comparisonPasses.find((pass) => pass.id === series.id)?.direction !== "stationary");
    const joined = independentRevs && derived?.mag
      ? { dfHz: derived.df, magnitude: Array.from(derived.mag) }
      : null;
    const angularAverage = !independentRevs ? averageAngularSeriesSpectrum(comparisonPasses.flatMap((pass) => {
      if (pass.direction === "stationary") return [];
      if (pass.samples?.anglesDeg?.length && pass.samples.currentA.length) return [{
        anglesDeg: pass.samples.anglesDeg,
        currentA: pass.samples.currentA,
        speedDegS: pass.measuredSpeedDegS,
      }];
      if (pass.profile?.currentA?.length) {
        const anglesDeg: number[] = [];
        const currentA: number[] = [];
        pass.profile.currentA.forEach((current, index) => {
          if (current === null) return;
          anglesDeg.push(pass.profile!.anglesDeg[index] ?? index + 0.5);
          currentA.push(current);
        });
        return [{ anglesDeg, currentA, speedDegS: pass.measuredSpeedDegS }];
      }
      return [];
    })) : null;
    const average = joined ?? angularAverage ?? averageFftSpectra((movingSpectra.length ? movingSpectra : passes).map((series) => series.spectrum));
    return average && passes.length > 1
      ? [...passes, { id: "average", label: joined ? "Serie unida" : "Promedio", color: "#f0f5ff", spectrum: average }]
      : passes;
  }, [comparisonPasses, independentRevs, derived?.mag, derived?.df, fftReferenceSpeed]);
  const selectedExtendedPass = comparisonPasses.find((pass) => pass.id === selectedFftSeries);
  const manualPeakKey = extendedFftSeries.length ? selectedFftSeries : "current";
  const selectedPeaks = manualPeaksBySeries[manualPeakKey] ?? [];
  const updateSelectedPeaks = (update: (peaks: Peak[]) => Peak[]) => {
    setManualPeaksBySeries((all) => ({ ...all, [manualPeakKey]: update(all[manualPeakKey] ?? []) }));
  };
  const displayedFftPeaks: Peak[] = extendedFftSeries.length
    ? (() => {
        const selected = extendedFftSeries.find((series) => series.id === selectedFftSeries)?.spectrum;
        return selected ? topPeaks(Float64Array.from(selected.magnitude), selected.dfHz, 5) : [];
      })()
    : derived?.peaks ?? [];
  const displayedFftSpeed = extendedFftSeries.length
    ? selectedExtendedPass?.direction === "stationary" ? null : fftReferenceSpeed
    : derived?.st.feedbackSpeedDegS ?? null;
  const displayedFftDfHz = extendedFftSeries.length
    ? extendedFftSeries.find((series) => series.id === selectedFftSeries)?.spectrum.dfHz ?? derived?.df ?? 0
    : derived?.df ?? 0;
  const extendedDisplaySeries = useMemo(() => comparisonPasses
    .filter((pass) => pass.direction !== "stationary")
    .flatMap((pass, passIndex) => {
    const factor = Math.max(1, Math.floor(flip.avgFactor));
    if (pass.samples?.anglesDeg?.length) {
      const length = Math.min(pass.samples.anglesDeg.length, pass.samples.currentA.length);
      const angleStats = movingWindowStats(pass.samples.anglesDeg.slice(0, length), factor);
      const currentStats = movingWindowStats(pass.samples.currentA.slice(0, length), factor);
      if (!angleStats || !currentStats) return [];
      const angles: number[] = [];
      const currents: number[] = [];
      const angleErr: number[] = [];
      const currentErr: number[] = [];
      for (let index = 0; index < angleStats.length; index++) {
        angles.push(angleStats.mean[index]);
        currents.push(currentStats.mean[index]);
        angleErr.push(angleStats.sem[index]);
        currentErr.push(currentStats.sem[index]);
      }
      return [{ id: pass.id, label: pass.label, color: REV_COLORS[passIndex % REV_COLORS.length], angles, currents, angleErr, currentErr }];
    }
    if (pass.profile?.currentA?.length) {
      const currents: number[] = [];
      const angles: number[] = [];
      pass.profile.currentA.forEach((value, index) => {
        if (value === null) return;
        currents.push(value);
        angles.push(pass.profile!.anglesDeg[index] ?? index + 0.5);
      });
      return [{ id: pass.id, label: `${pass.label} · sesión antigua`, color: REV_COLORS[passIndex % REV_COLORS.length], angles, currents, angleErr: currents.map(() => 0), currentErr: currents.map(() => 0) }];
    }
      return [];
    }), [comparisonPasses, flip.avgFactor]);
  const activeExtendedSeries = useMemo(
    () => extendedDisplaySeries.filter((series) => !hiddenExtendedSeries.has(series.id)),
    [extendedDisplaySeries, hiddenExtendedSeries],
  );
  const extendedMeanProfile = useMemo(() => {
    if (activeExtendedSeries.length < 2) return null;
    const bySeries = activeExtendedSeries.map((series) => {
      const sums = new Float64Array(360);
      const angleErrSquares = new Float64Array(360);
      const counts = new Uint32Array(360);
      series.angles.forEach((angle, index) => {
        const phase = ((angle % 360) + 360) % 360;
        const bin = Math.min(359, Math.floor(phase));
        sums[bin] += series.currents[index];
        angleErrSquares[bin] += series.angleErr[index] ** 2;
        counts[bin]++;
      });
      return {
        currentA: Array.from(sums, (sum, index) => counts[index] ? sum / counts[index] : null),
        angleErr: Array.from(angleErrSquares, (sum, index) => counts[index] ? Math.sqrt(sum) / counts[index] : 0),
      };
    });
    const currentA: (number | null)[] = [];
    const currentErr: number[] = [];
    const angleErr: number[] = [];
    for (let bin = 0; bin < 360; bin++) {
      const populated = bySeries.filter((series) => series.currentA[bin] !== null);
      const values = populated.map((series) => series.currentA[bin] as number);
      if (!values.length) { currentA.push(null); currentErr.push(0); angleErr.push(0); continue; }
      const average = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - average) ** 2, 0) / (values.length - 1) : 0;
      currentA.push(average);
      currentErr.push(Math.sqrt(variance / values.length));
      // La coordenada representa un bin de 1°. Se conserva al menos su
      // semiancho y se propaga además la incertidumbre angular de cada serie.
      const propagated = Math.sqrt(populated.reduce((sum, series) => sum + series.angleErr[bin] ** 2, 0)) / populated.length;
      angleErr.push(Math.max(0.5, propagated));
    }
    return { currentA, currentErr, angleErr };
  }, [activeExtendedSeries]);
  const polarProfile = useMemo(() => {
    if (extendedDisplaySeries.length) {
      if (!activeExtendedSeries.length) return null;
      if (extendedMeanProfile) return extendedMeanProfile;
      const series = activeExtendedSeries[0];
      const sums = new Float64Array(360);
      const sums2 = new Float64Array(360);
      const counts = new Uint32Array(360);
      series.angles.forEach((angle, index) => {
        const bin = Math.min(359, Math.floor(((angle % 360) + 360) % 360));
        const current = series.currents[index];
        sums[bin] += current; sums2[bin] += current * current; counts[bin]++;
      });
      return {
        currentA: Array.from(sums, (sum, index) => counts[index] ? sum / counts[index] : null),
        currentErr: Array.from(sums, (sum, index) => {
          const count = counts[index];
          if (count < 2) return 0;
          const variance = Math.max(0, (sums2[index] - sum * sum / count) / (count - 1));
          return Math.sqrt(variance / count);
        }),
      };
    }
    const plot = derived?.plot;
    if (!plot) return null;
    const sums = new Float64Array(360);
    const counts = new Uint32Array(360);
    for (let i = 0; i < plot.length; i++) {
      const bin = Math.min(359, Math.floor(((plot.angles[i] % 360) + 360) % 360));
      sums[bin] += plot.amps[i]; counts[bin]++;
    }
    return { currentA: Array.from(sums, (sum, index) => counts[index] ? sum / counts[index] : null), currentErr: Array(360).fill(0) as number[] };
  }, [extendedDisplaySeries, activeExtendedSeries, extendedMeanProfile, derived]);
  const selectedEllipse = useMemo(() => {
    if (!polarProfile) return null;
    const angles: number[] = [];
    const currents: number[] = [];
    polarProfile.currentA.forEach((current, index) => {
      if (current === null) return;
      angles.push(index + 0.5); currents.push(current);
    });
    return fitPolarEllipse(angles, currents);
  }, [polarProfile]);
  const polarLoadAnalysis = useMemo(() => {
    if (!polarProfile) return null;
    const values = polarProfile.currentA;
    const populated = values.filter((value): value is number => value !== null);
    if (!populated.length) return null;
    const globalMean = populated.reduce((sum, value) => sum + value, 0) / populated.length;
    const smooth = values.map((_, index) => {
      const neighbors: number[] = [];
      for (let offset = -2; offset <= 2; offset++) {
        const value = values[(index + offset + 360) % 360];
        if (value !== null) neighbors.push(value);
      }
      return neighbors.length ? neighbors.reduce((sum, value) => sum + value, 0) / neighbors.length : null;
    });
    const flags = smooth.map((value) => value !== null && value > globalMean);
    const zones: Array<{ startDeg: number; endDeg: number; widthDeg: number; meanA: number; uncertaintyA: number; excess: number }> = [];
    const falseIndex = flags.findIndex((flag) => !flag);
    if (falseIndex >= 0) {
      let start: number | null = null;
      for (let step = 1; step <= 360; step++) {
        const index = (falseIndex + step) % 360;
        if (flags[index] && start === null) start = index;
        const next = (index + 1) % 360;
        if (start !== null && (!flags[next] || step === 360)) {
          const indices: number[] = [];
          let cursor = start;
          while (true) { indices.push(cursor); if (cursor === index) break; cursor = (cursor + 1) % 360; }
          const zoneValues = indices.map((bin) => values[bin]).filter((value): value is number => value !== null);
          const zoneErrors = indices.map((bin) => polarProfile.currentErr[bin] ?? 0);
          if (indices.length >= 2 && zoneValues.length) {
            zones.push({
              startDeg: start,
              endDeg: (index + 1) % 360,
              widthDeg: indices.length,
              meanA: zoneValues.reduce((sum, value) => sum + value, 0) / zoneValues.length,
              uncertaintyA: Math.sqrt(zoneErrors.reduce((sum, error) => sum + error * error, 0)) / zoneValues.length,
              excess: zoneValues.reduce((sum, value) => sum + Math.max(0, value - globalMean), 0),
            });
          }
          start = null;
        }
      }
    }
    const angles: number[] = [];
    const currents: number[] = [];
    values.forEach((value, index) => { if (value !== null) { angles.push(index + 0.5); currents.push(value); } });
    return {
      globalMean,
      zones,
      dominantZone: zones.length ? zones.reduce((best, zone) => zone.excess > best.excess ? zone : best) : null,
      circular: circularStats(angles, currents),
    };
  }, [polarProfile]);
  const extendedSummary = useMemo(() => {
    if (!comparisonPasses.length) return null;
    const motionPasses = comparisonPasses.filter((pass) => pass.direction !== "stationary");
    const passStats = (motionPasses.length ? motionPasses : comparisonPasses).map((pass) => pass.statistics);
    const summarize = (values: number[]) => {
      const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
      const variance = values.length > 1 ? values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1) : 0;
      return { mean, uncertainty: Math.sqrt(variance / values.length) };
    };
    const directionValues = passStats.filter((item) => item.circularMeanDeg !== null && item.circularR !== null);
    const direction = directionValues.length
      ? circularStats(directionValues.map((item) => item.circularMeanDeg!), directionValues.map((item) => item.circularR!))
      : null;
    const ellipses = passStats.map((item) => item.ellipse).filter((ellipse): ellipse is NonNullable<typeof ellipse> => ellipse !== null);
    if (independentRevs && derived) {
      const ellipse = derived.ellipse;
      return {
        mode: "joined" as const,
        current: { mean: derived.st.mean, uncertainty: derived.st.sem },
        rate: { mean: derived.st.rateEst, uncertainty: 0 },
        speed: { mean: derived.st.feedbackSpeedDegS ?? 0, uncertainty: 0 },
        circularR: { mean: derived.st.circ?.R ?? 0, uncertainty: 0 },
        direction: derived.st.circ ? { mean: derived.st.circ.meanDeg, uncertainty: derived.st.circ.stdDeg } : null,
        semiMajor: ellipse ? { mean: ellipse.semiMajor, uncertainty: 0 } : null,
        semiMinor: ellipse ? { mean: ellipse.semiMinor, uncertainty: 0 } : null,
        ellipseRatio: ellipse ? { mean: ellipse.semiMajor / ellipse.semiMinor, uncertainty: 0 } : null,
        ellipseAngle: ellipse ? { mean: ellipse.angleDeg, uncertainty: 0 } : null,
        maxA: derived.st.maxA,
        totalSamples: derived.st.n,
        totalDurationS: derived.st.durS,
      };
    }
    return {
      mode: "between" as const,
      current: summarize(passStats.map((item) => item.meanA)),
      rate: summarize(passStats.map((item) => item.effectiveRateHz)),
      speed: summarize(passStats.map((item) => item.measuredSpeedDegS ?? 0)),
      circularR: summarize(passStats.map((item) => item.circularR ?? 0)),
      direction: direction ? { mean: direction.meanDeg, uncertainty: direction.stdDeg / Math.sqrt(directionValues.length) } : null,
      semiMajor: ellipses.length ? summarize(ellipses.map((ellipse) => ellipse.semiMajor)) : null,
      semiMinor: ellipses.length ? summarize(ellipses.map((ellipse) => ellipse.semiMinor)) : null,
      ellipseRatio: ellipses.length ? summarize(ellipses.map((ellipse) => ellipse.semiMajor / ellipse.semiMinor)) : null,
      ellipseAngle: ellipses.length ? summarize(ellipses.map((ellipse) => ellipse.angleDeg)) : null,
      maxA: Math.max(...passStats.map((item) => item.maxA)),
      totalSamples: passStats.reduce((sum, item) => sum + item.n, 0),
      totalDurationS: passStats.reduce((sum, item) => sum + item.durationS, 0),
    };
  }, [comparisonPasses, independentRevs, derived]);
  const aiPrompt = useMemo(() => {
    if (!derived && !extendedSummary) return "";
    const axis = flip.captureMetadata.axis === 1 ? "AR" : flip.captureMetadata.axis === 2 ? "DEC" : "no indicado";
    const direction = flip.captureMetadata.direction?.toUpperCase() ?? "no indicada";
    const lines = [
      "Actúa como analista técnico de una montura Sky-Watcher NEQ6.",
      "Interpreta el perfil de corriente como indicador del esfuerzo mecánico del conjunto sinfín-corona.",
      "Distingue indicios mecánicos, del tren motor y eléctricos/muestreo; no afirmes una causa sin evidencia suficiente.",
      "Responde de forma concisa, sin introducción ni explicaciones generales, usando exactamente estas tres secciones:",
      "1. ANÁLISIS DE RESULTADOS: resume los patrones relevantes y cita los valores que los sostienen.",
      "2. CAUSAS MÁS PROBABLES: hipótesis ordenadas por plausibilidad, indicando brevemente la evidencia y una comprobación discriminante.",
      "3. ANÁLISIS DE RIESGO: nivel bajo/medio/alto, justificación y si conviene detener, vigilar o ajustar la montura.",
      "Extensión máxima: 350 palabras.",
      "",
      `Eje: ${axis}`,
      `Sentido: ${direction}`,
      `Tipo: ${flip.extendedAnalysis ? "test extendido" : "test básico"}`,
      `Media móvil: ${flip.avgFactor} muestras`,
      `Modo de revoluciones: ${independentRevs ? "serie continua; adquisición temporal concatenada" : "revoluciones independientes; superpuestas y promediadas entre vueltas"}`,
    ];
    if (derived && !flip.extendedAnalysis) {
      lines.push(
        `Muestras: ${derived.st.n}`,
        `Duración: ${derived.st.durS.toFixed(3)} s`,
        `Tasa efectiva: ${derived.st.rateEst.toFixed(3)} Hz`,
        `Recorrido: ${derived.st.angleSpanDeg.toFixed(3)}°`,
        `Velocidad medida: ${derived.st.feedbackSpeedDegS?.toFixed(6) ?? "no disponible"} °/s`,
        `Corriente: media ${derived.st.mean.toFixed(6)} A; desviación ${derived.st.sd.toFixed(6)} A; mediana ${derived.st.median.toFixed(6)} A; máximo ${derived.st.maxA.toFixed(6)} A a ${derived.st.maxAngleDeg?.toFixed(3) ?? "?"}°`,
      );
      if (polarLoadAnalysis) lines.push(`Carga circular: dirección ${polarLoadAnalysis.circular.meanDeg.toFixed(3)}°; R ${polarLoadAnalysis.circular.R.toFixed(6)}; dispersión ${polarLoadAnalysis.circular.stdDeg.toFixed(3)}°`);
      if (derived.ellipse) lines.push(`Elipse: a ${derived.ellipse.semiMajor.toFixed(6)} A; b ${derived.ellipse.semiMinor.toFixed(6)} A; a/b ${(derived.ellipse.semiMajor / derived.ellipse.semiMinor).toFixed(6)}; inclinación ${derived.ellipse.angleDeg.toFixed(3)}°; RMS ${derived.ellipse.rms.toFixed(6)}`);
      lines.push("Picos FFT:");
      derived.peaks.forEach((peak, index) => lines.push(`${index + 1}. ${peak.freq.toFixed(6)} Hz; periodo angular ${derived.st.feedbackSpeedDegS ? (peak.period * derived.st.feedbackSpeedDegS).toFixed(6) : "?"}°; magnitud ${peak.mag.toExponential(6)}`));
    }
    if (!flip.extendedAnalysis && extendedSummary && basicPasses.length) {
      lines.push(
        `Revoluciones analizadas: ${basicPasses.length}`,
        `${independentRevs ? "Corriente de la serie unida" : "Corriente media entre vueltas"}: ${extendedSummary.current.mean.toFixed(6)} ± ${extendedSummary.current.uncertainty.toFixed(6)} A`,
        `${independentRevs ? "Velocidad de la serie" : "Velocidad media"}: ${extendedSummary.speed.mean.toFixed(6)}${independentRevs ? "" : ` ± ${extendedSummary.speed.uncertainty.toFixed(6)}`} °/s`,
        `${independentRevs ? "Concentración circular de la serie" : "Concentración circular media"}: ${extendedSummary.circularR.mean.toFixed(6)}${independentRevs ? "" : ` ± ${extendedSummary.circularR.uncertainty.toFixed(6)}`}`,
        "Resumen por revolución:",
      );
      basicPasses.forEach((pass) => {
        lines.push(`${pass.label}: ${pass.statistics.meanA.toFixed(6)} ± ${pass.statistics.semA.toFixed(6)} A; máximo ${pass.statistics.maxA.toFixed(6)} A a ${pass.statistics.maxAngleDeg?.toFixed(3) ?? "?"}°; ${pass.statistics.measuredSpeedDegS?.toFixed(6) ?? "?"} °/s`);
        pass.peaks.slice(0, 8).forEach((peak) => lines.push(`  FFT ${peak.frequencyHz.toFixed(6)} Hz; ${peak.periodMountDeg?.toFixed(6) ?? "?"}°; magnitud ${peak.magnitude.toExponential(4)}`));
      });
    }
    if (flip.extendedAnalysis && extendedSummary) {
      lines.push(
        `Fases móviles: ${extendedPasses.filter((pass) => pass.direction !== "stationary").length}`,
        `Corriente media entre fases: ${extendedSummary.current.mean.toFixed(6)} ± ${extendedSummary.current.uncertainty.toFixed(6)} A`,
        `Velocidad media: ${extendedSummary.speed.mean.toFixed(6)} ± ${extendedSummary.speed.uncertainty.toFixed(6)} °/s`,
        `Máximo global: ${extendedSummary.maxA.toFixed(6)} A`,
        "Coincidencias espectrales:",
      );
      flip.extendedAnalysis.groups.forEach((group, index) => lines.push(`${index + 1}. ${group.classification}; ${group.representativeHz.toFixed(6)} Hz; ${group.representativeDeg?.toFixed(6) ?? "?"}°; fases ${group.passes.join("/")}; ${group.reason}`));
      lines.push("Resumen por fase:");
      extendedPasses.forEach((pass) => lines.push(`${pass.label}: ${pass.statistics.meanA.toFixed(6)} ± ${pass.statistics.semA.toFixed(6)} A; ${pass.statistics.measuredSpeedDegS?.toFixed(6) ?? "?"} °/s; ${pass.statistics.angleSpanDeg.toFixed(3)}°; ${pass.peaks.length} picos`));
    }
    return lines.join("\n");
  }, [derived, extendedSummary, extendedPasses, basicPasses, flip.avgFactor, flip.captureMetadata, flip.extendedAnalysis, polarLoadAnalysis, independentRevs]);
  void aiResponseVersion;
  const currentAiFingerprint = analysisFingerprint(aiPrompt);
  const currentAiAnalyses = aiSettings.enabled ? aiSettings.providers.flatMap((provider) => {
    const saved = getAiResponse(provider.id, currentAiFingerprint);
    return saved ? [{
      providerId: provider.id,
      providerName: provider.name,
      fingerprint: currentAiFingerprint,
      text: saved.text,
      updatedAt: saved.updatedAt,
    }] : [];
  }) : [];
  void flip.tick;
  useEffect(() => {
    if (!n) setManualPeaksBySeries({});
  }, [n]);
  useEffect(() => {
    if (flip.extendedAnalysis) return;
    setHiddenExtendedSeries(new Set());
    setShowExtendedMean(true);
  }, [flip.extendedAnalysis]);
  useEffect(() => {
    if (flip.extendedAnalysis) setManualPeaksBySeries({});
  }, [flip.extendedAnalysis]);
  useEffect(() => {
    if (!aiSettings.enabled && view === "ai") setView("stats");
  }, [aiSettings.enabled, view]);
  useEffect(() => {
    if (!extendedFftSeries.some((series) => series.id === selectedFftSeries)) {
      setSelectedFftSeries(extendedFftSeries.some((series) => series.id === "average") ? "average" : extendedFftSeries[0]?.id ?? "average");
    }
  }, [extendedFftSeries, selectedFftSeries]);

  const setViewport = (next: ChartViewport) => setViewports((all) => ({ ...all, [view]: next }));
  const resetView = () => setViewports((all) => ({ ...all, [view]: RESET_VIEWPORT }));

  const updateCursor = (x: number, y: number, w: number, h: number) => {
    const clamp = (value: number, lower: number, upper: number) => Math.min(upper, Math.max(lower, value));
    const viewport = viewports[view];
    if (view === "polar") {
      let maxI = 0.05;
      if (derived?.plot) for (let i = 0; i < derived.plot.length; i++) maxI = Math.max(maxI, derived.plot.amps[i]);
      for (const series of activeExtendedSeries) for (const current of series.currents) maxI = Math.max(maxI, current);
      maxI *= 1.15;
      const radius = Math.min(w, h) / 2 - 22;
      const spanX = viewport.x1 - viewport.x0;
      const spanY = viewport.y1 - viewport.y0;
      const graphX = (x + viewport.x0 * w / spanX) * spanX;
      const graphY = (y + viewport.y0 * h / spanY) * spanY;
      const dx = graphX - w / 2;
      const dy = graphY - h / 2;
      const angle = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      const current = Math.max(0, Math.hypot(dx, dy) / Math.max(radius, 1) * maxI);
      setCursorLabel(`θ ${angle.toFixed(1)}° · I ${current.toFixed(3)} A`);
      return;
    }
    if (view === "cartesiano") {
      let minI = Infinity;
      let maxI = -Infinity;
      if (derived?.plot) for (let i = 0; i < derived.plot.length; i++) {
        minI = Math.min(minI, derived.plot.amps[i] - derived.plot.ampsErr[i]);
        maxI = Math.max(maxI, derived.plot.amps[i] + derived.plot.ampsErr[i]);
      }
      for (const series of activeExtendedSeries) for (let i = 0; i < series.currents.length; i++) {
        minI = Math.min(minI, series.currents[i] - series.currentErr[i]);
        maxI = Math.max(maxI, series.currents[i] + series.currentErr[i]);
      }
      if (!Number.isFinite(minI) || !Number.isFinite(maxI)) return;
      const span = Math.max(0.01, maxI - minI);
      const fullMinI = Math.max(0, minI - span * 0.12);
      const fullMaxI = maxI + span * 0.12;
      minI = fullMinI + (1 - viewport.y1) * (fullMaxI - fullMinI);
      maxI = fullMinI + (1 - viewport.y0) * (fullMaxI - fullMinI);
      const angle = clamp(viewport.x0 * cartesianFullAngleDeg + ((x - 46) / Math.max(1, w - 56)) * (viewport.x1 - viewport.x0) * cartesianFullAngleDeg, 0, cartesianFullAngleDeg);
      const current = minI + ((h - 20 - y) / Math.max(1, h - 30)) * (maxI - minI);
      setCursorLabel(`θ ${angle.toFixed(2)}° · I ${current.toFixed(3)} A`);
      return;
    }
    if (view === "fft") {
      const left = 10;
      const visible = overlayFftSeries
        ? extendedFftSeries
        : extendedFftSeries.filter((series) => series.id === selectedFftSeries);
      const spectra = visible.length ? visible : extendedFftSeries;
      const maxHz = spectra.length
        ? Math.max(...spectra.map((series) => (series.spectrum.magnitude.length - 1) * series.spectrum.dfHz))
        : derived?.mag ? (derived.mag.length - 1) * derived.df : 0;
      const frequency = clamp((viewport.x0 + ((x - left) / Math.max(1, w - left * 2)) * (viewport.x1 - viewport.x0)) * maxHz, 0, maxHz);
      setCursorLabel(`f ${frequency.toFixed(maxHz < 10 ? 3 : 2)} Hz`);
      return;
    }
    const width = Math.min(n, 2400);
    const first = Math.max(0, n - width);
    const sample = clamp(Math.round(first + (viewport.x0 + ((x - 4) / Math.max(1, w - 8)) * (viewport.x1 - viewport.x0)) * Math.max(0, width - 1)), first, Math.max(first, n - 1));
    const current = n ? flip.adcToAmps(flip.buffers.adcRef.current[sample]) : 0;
    setCursorLabel(`muestra ${sample + 1} · I ${current.toFixed(3)} A`);
  };

  /* ── dibujo: vivo ────────────────────────────────────── */
  const drawLive = (ctx: CanvasRenderingContext2D, w: number, h: number, viewport = RESET_VIEWPORT) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = "9px IBM Plex Mono, monospace";
    if (!n) {
      ctx.fillStyle = "#42567a";
      ctx.textAlign = "center";
      ctx.fillText("sin muestras — START para capturar", w / 2, h / 2);
      return;
    }
    const W = Math.min(n, 2400);
    const fullI0 = n - W;
    const i0 = fullI0 + Math.floor(viewport.x0 * Math.max(0, W - 1));
    const i1 = Math.min(n - 1, fullI0 + Math.max(1, Math.ceil(viewport.x1 * Math.max(1, W - 1))));
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = i0; i <= i1; i++) {
      const a = flip.adcToAmps(flip.buffers.adcRef.current[i]);
      if (a < mn) mn = a;
      if (a > mx) mx = a;
    }
    if (mx - mn < 0.01) mx = mn + 0.01;
    const fullMin = mn;
    const fullMax = mx;
    mn = fullMin + (1 - viewport.y1) * (fullMax - fullMin);
    mx = fullMin + (1 - viewport.y0) * (fullMax - fullMin);
    const pad = 14;
    ctx.strokeStyle = "rgba(245,165,36,0.9)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = i0; i <= i1; i++) {
      const x = ((i - i0) / Math.max(1, i1 - i0)) * (w - 8) + 4;
      const y = h - pad - ((flip.adcToAmps(flip.buffers.adcRef.current[i]) - mn) / (mx - mn)) * (h - pad * 2);
      i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ap = flip.buffers.angleRef.current;
    if (ap.length > 1) {
      const tb0 = flip.buffers.tbRef.current[i0];
      const tb1 = flip.buffers.tbRef.current[i1];
      ctx.strokeStyle = "rgba(76,201,240,0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      let started = false;
      for (const p of ap) {
        if (p.tb < tb0 || p.tb > tb1) continue;
        const x = ((p.tb - tb0) / (tb1 - tb0 || 1)) * (w - 8) + 4;
        const y = h - pad - (p.deg / 360) * (h - pad * 2);
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
    }
    ctx.fillStyle = "#f5a524";
    ctx.textAlign = "left";
    ctx.fillText(`${mx.toFixed(3)} A`, 6, 10);
    ctx.fillStyle = "#5f7396";
    ctx.fillText(`${mn.toFixed(3)} A`, 6, h - 4);
    ctx.textAlign = "right";
    ctx.fillText(`${(n / 1000).toFixed(1)}k mues.`, w - 6, 10);
  };

  /* ── dibujo: polar ───────────────────────────────────── */
  const drawPolar = (ctx: CanvasRenderingContext2D, w: number, h: number, viewport = RESET_VIEWPORT) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 22;
    const data = derived?.plot;
    if (!data && !extendedDisplaySeries.length) {
      ctx.fillStyle = "#42567a";
      ctx.textAlign = "center";
      ctx.fillText("necesita ángulo de la montura durante la captura", w / 2, h / 2);
      return;
    }
    /* El dominio polar se reproyecta desde las series vectoriales para la zona
     * elegida. No se amplía una imagen: al cambiar el viewport se vuelve a
     * calcular cada punto, eje y ajuste. */
    const spanX = viewport.x1 - viewport.x0;
    const spanY = viewport.y1 - viewport.y0;
    ctx.save();
    ctx.translate((-viewport.x0 * w) / spanX, (-viewport.y0 * h) / spanY);
    ctx.scale(1 / spanX, 1 / spanY);
    let maxI = 0.05;
    if (data) for (let i = 0; i < data.length; i++) maxI = Math.max(maxI, data.amps[i]);
    for (const series of activeExtendedSeries) for (const current of series.currents) maxI = Math.max(maxI, current);
    maxI *= 1.15;
    if (polarLoadAnalysis) {
      for (const zone of polarLoadAnalysis.zones) {
        const a0 = ((zone.startDeg - 90) * Math.PI) / 180;
        const a1 = ((zone.startDeg + zone.widthDeg - 90) * Math.PI) / 180;
        const dominant = zone === polarLoadAnalysis.dominantZone;
        ctx.fillStyle = dominant ? "rgba(245,165,36,0.14)" : "rgba(245,165,36,0.055)";
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, R, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.strokeStyle = "rgba(29,48,80,0.9)";
    ctx.fillStyle = "#42567a";
    ctx.font = "8.5px IBM Plex Mono, monospace";
    for (const f of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (polarLoadAnalysis) {
      const meanRadius = (polarLoadAnalysis.globalMean / maxI) * R;
      ctx.strokeStyle = "rgba(245,165,36,0.55)";
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, meanRadius, 0, Math.PI * 2);
      ctx.stroke();
      const direction = polarLoadAnalysis.circular.meanDeg * Math.PI / 180;
      ctx.strokeStyle = "rgba(76,201,240,0.9)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(direction) * R, cy - Math.cos(direction) * R);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (polarLoadAnalysis) {
      ctx.fillStyle = "rgba(76,201,240,0.9)";
      ctx.textAlign = "left";
      ctx.fillText(`dirección carga=${polarLoadAnalysis.circular.meanDeg.toFixed(1)}° · R̄=${polarLoadAnalysis.circular.R.toFixed(3)} · círculo medio=${polarLoadAnalysis.globalMean.toFixed(3)} A`, 6, extendedDisplaySeries.length ? 35 : 47);
    }
    ctx.textAlign = "center";
    for (let a = 0; a < 360; a += 30) {
      const r = (a * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.sin(r) * R, cy - Math.cos(r) * R);
      ctx.strokeStyle = "rgba(29,48,80,0.5)";
      ctx.stroke();
      ctx.fillText(`${a}°`, cx + Math.sin(r) * (R + 12), cy - Math.cos(r) * (R + 12) + 3);
    }
    const plot = (color: string, width: number, rev?: number) => {
      if (!data) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      const stride = renderStride(data.length, w);
      for (let i = 0; i < data.length; i += stride) {
        if (rev !== undefined && data.revs[i] !== rev) {
          started = false;
          continue;
        }
        const r = (data.amps[i] / maxI) * R;
        const phase = ((data.angles[i] % 360) + 360) % 360;
        const a = (phase * Math.PI) / 180;
        const x = cx + Math.sin(a) * r;
        const y = cy - Math.cos(a) * r;
        started ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        started = true;
      }
      ctx.stroke();
    };
    const plotSeries = (angles: number[], currents: number[], color: string, width: number) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      let previousPhase: number | null = null;
      const length = Math.min(angles.length, currents.length);
      const stride = renderStride(length, w);
      for (let i = 0; i < length; i += stride) {
        const current = currents[i];
        const phase = ((angles[i] % 360) + 360) % 360;
        const angle = (phase * Math.PI) / 180;
        const radius = (current / maxI) * R;
        const x = cx + Math.sin(angle) * radius;
        const y = cy - Math.cos(angle) * radius;
        if (!started || (previousPhase !== null && Math.abs(phase - previousPhase) > 180)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        started = true;
        previousPhase = phase;
      }
      ctx.stroke();
    };
    const plotMean = () => {
      if (!extendedMeanProfile || !showExtendedMean) return;
      const angles = extendedMeanProfile.currentA.map((_, index) => index + 0.5);
      const currents = extendedMeanProfile.currentA.map((value) => value ?? NaN);
      plotSeries(angles.filter((_, index) => Number.isFinite(currents[index])), currents.filter(Number.isFinite), "rgba(240,245,255,0.62)", 2.4);
      ctx.strokeStyle = "rgba(240,245,255,0.55)";
      ctx.lineWidth = 1;
      for (let i = 0; i < currents.length; i += 10) {
        const current = currents[i];
        const error = extendedMeanProfile.currentErr[i];
        if (!Number.isFinite(current) || !(error > 0)) continue;
        const angle = ((i + 0.5) * Math.PI) / 180;
        const r0 = ((current - error) / maxI) * R;
        const r1 = ((current + error) / maxI) * R;
        ctx.beginPath();
        ctx.moveTo(cx + Math.sin(angle) * r0, cy - Math.cos(angle) * r0);
        ctx.lineTo(cx + Math.sin(angle) * r1, cy - Math.cos(angle) * r1);
        ctx.stroke();
      }
    };
    if (extendedDisplaySeries.length) {
      activeExtendedSeries.forEach((series) => plotSeries(series.angles, series.currents, series.color, 1.35));
      if (flip.capturing) plot("rgba(245,165,36,0.75)", 1);
      plotMean();
    } else if (flip.overlayRevs && data) {
      const lastRev = data.revs[data.length - 1] ?? 0;
      for (let rev = 0; rev <= Math.min(lastRev, 11); rev++) {
        plot(REV_COLORS[rev % REV_COLORS.length], 1.7, rev);
      }
      ctx.textAlign = "right";
      for (let rev = 0; rev <= Math.min(lastRev, 9); rev++) {
        ctx.fillStyle = REV_COLORS[rev % REV_COLORS.length];
        ctx.fillText(`rev ${rev + 1}`, w - 8, 11 + rev * 11);
      }
    } else plot("rgba(245,165,36,0.95)", 1.6);
    const fit = derived?.ellipse;
    if (fit && !flip.capturing && !extendedDisplaySeries.length) {
      const scale = R / maxI;
      const ex = cx + fit.centerX * scale;
      const ey = cy + fit.centerY * scale;
      const angle = (fit.angleDeg * Math.PI) / 180;
      const ca = Math.cos(angle);
      const sa = Math.sin(angle);
      ctx.strokeStyle = "rgba(76,201,240,0.95)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex, ey, fit.semiMajor * scale, fit.semiMinor * scale, angle, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(ex - ca * fit.semiMajor * scale, ey - sa * fit.semiMajor * scale);
      ctx.lineTo(ex + ca * fit.semiMajor * scale, ey + sa * fit.semiMajor * scale);
      ctx.moveTo(ex + sa * fit.semiMinor * scale, ey - ca * fit.semiMinor * scale);
      ctx.lineTo(ex - sa * fit.semiMinor * scale, ey + ca * fit.semiMinor * scale);
      ctx.stroke();
      ctx.fillStyle = "#4cc9f0";
      ctx.textAlign = "left";
      ctx.fillText(
        `elipse a=${fit.semiMajor.toFixed(3)} A · b=${fit.semiMinor.toFixed(3)} A · a/b=${(fit.semiMajor / fit.semiMinor).toFixed(3)} · φ=${fit.angleDeg.toFixed(1)}°`,
        6,
        23,
      );
      const centerAngle = ((Math.atan2(fit.centerX, -fit.centerY) * 180) / Math.PI + 360) % 360;
      ctx.fillText(`centro x=${fit.centerX.toFixed(3)} · y=${fit.centerY.toFixed(3)} A · r=${Math.hypot(fit.centerX, fit.centerY).toFixed(3)} A @ ${centerAngle.toFixed(1)}°`, 6, 35);
    }
    if (selectedEllipse && extendedDisplaySeries.length && activeExtendedSeries.length && !flip.capturing) {
      const scale = R / maxI;
      const ex = cx + selectedEllipse.centerX * scale;
      const ey = cy + selectedEllipse.centerY * scale;
      const angle = selectedEllipse.angleDeg * Math.PI / 180;
      const ca = Math.cos(angle), sa = Math.sin(angle);
      ctx.strokeStyle = "rgba(181,222,255,0.72)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.ellipse(ex, ey, selectedEllipse.semiMajor * scale, selectedEllipse.semiMinor * scale, angle, 0, Math.PI * 2);
      ctx.moveTo(ex - ca * selectedEllipse.semiMajor * scale, ey - sa * selectedEllipse.semiMajor * scale);
      ctx.lineTo(ex + ca * selectedEllipse.semiMajor * scale, ey + sa * selectedEllipse.semiMajor * scale);
      ctx.moveTo(ex + sa * selectedEllipse.semiMinor * scale, ey - ca * selectedEllipse.semiMinor * scale);
      ctx.lineTo(ex - sa * selectedEllipse.semiMinor * scale, ey + ca * selectedEllipse.semiMinor * scale);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(181,222,255,0.9)";
      ctx.textAlign = "left";
      ctx.fillText(`elipse selección a=${selectedEllipse.semiMajor.toFixed(3)} · b=${selectedEllipse.semiMinor.toFixed(3)} A · a/b=${(selectedEllipse.semiMajor / selectedEllipse.semiMinor).toFixed(3)} · φ=${selectedEllipse.angleDeg.toFixed(1)}°`, 6, 23);
    }
    ctx.fillStyle = "#f5a524";
    ctx.textAlign = "left";
    ctx.fillText(`max ${maxI.toFixed(3)} A · ${data?.length.toLocaleString("es-ES") ?? 0} puntos actuales`, 6, 11);
    ctx.restore();
  };

  /* ── dibujo: cartesiano con barras de error ──────────── */
  const drawCart = (ctx: CanvasRenderingContext2D, w: number, h: number, viewport = RESET_VIEWPORT) => {
    ctx.clearRect(0, 0, w, h);
    const L = 46;
    const Bm = 20;
    const T = 10;
    const Rg = 10;
    const data = derived?.plot;
    if (!data && !extendedDisplaySeries.length) {
      ctx.fillStyle = "#42567a";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("necesita ángulo de la montura durante la captura", w / 2, h / 2);
      return;
    }
    let minI = Infinity;
    let maxI = -Infinity;
    if (data) for (let i = 0; i < data.length; i++) {
      minI = Math.min(minI, data.amps[i] - data.ampsErr[i]);
      maxI = Math.max(maxI, data.amps[i] + data.ampsErr[i]);
    }
    for (const series of activeExtendedSeries) for (let i = 0; i < series.currents.length; i++) {
      minI = Math.min(minI, series.currents[i] - series.currentErr[i]);
      maxI = Math.max(maxI, series.currents[i] + series.currentErr[i]);
    }
    if (extendedMeanProfile) extendedMeanProfile.currentA.forEach((current, index) => {
      if (current === null) return;
      minI = Math.min(minI, current - extendedMeanProfile.currentErr[index]);
      maxI = Math.max(maxI, current + extendedMeanProfile.currentErr[index]);
    });
    if (!Number.isFinite(minI) || !Number.isFinite(maxI)) return;
    const span = Math.max(0.01, maxI - minI);
    const fullMinI = Math.max(0, minI - span * 0.12);
    const fullMaxI = maxI + span * 0.12;
    const fullSpanI = fullMaxI - fullMinI;
    minI = fullMinI + (1 - viewport.y1) * fullSpanI;
    maxI = fullMinI + (1 - viewport.y0) * fullSpanI;
    const minAngle = viewport.x0 * cartesianFullAngleDeg;
    const maxAngle = viewport.x1 * cartesianFullAngleDeg;
    const X = (a: number) => L + ((a - minAngle) / (maxAngle - minAngle || 1)) * (w - L - Rg);
    const Y = (v: number) => h - Bm - ((v - minI) / (maxI - minI || 1)) * (h - T - Bm);
    if (polarLoadAnalysis?.zones.length && extendedDisplaySeries.length) {
      const repetitions = sequentialCartesian ? basicPasses.length : 1;
      for (let revolution = 0; revolution < repetitions; revolution++) {
        for (const zone of polarLoadAnalysis.zones) {
          const ranges = zone.startDeg + zone.widthDeg <= 360
            ? [[zone.startDeg, zone.startDeg + zone.widthDeg]]
            : [[zone.startDeg, 360], [0, zone.startDeg + zone.widthDeg - 360]];
          const dominant = polarLoadAnalysis.dominantZone === zone;
          ctx.fillStyle = dominant ? "rgba(245,165,36,0.12)" : "rgba(245,165,36,0.055)";
          for (const [start, end] of ranges) {
            const offset = revolution * 360;
            const visibleStart = Math.max(start + offset, minAngle);
            const visibleEnd = Math.min(end + offset, maxAngle);
            if (visibleEnd > visibleStart) ctx.fillRect(X(visibleStart), T, X(visibleEnd) - X(visibleStart), h - T - Bm);
          }
        }
      }
    }
    if (derived?.minSector && !extendedDisplaySeries.length) {
      ctx.fillStyle = "rgba(76,201,240,0.09)";
      ctx.fillRect(X(derived.minSector.angle - 5), T, X(derived.minSector.angle + 5) - X(derived.minSector.angle - 5), h - T - Bm);
    }
    if (derived?.maxSector && !extendedDisplaySeries.length) {
      ctx.fillStyle = "rgba(245,165,36,0.12)";
      ctx.fillRect(X(derived.maxSector.angle - 5), T, X(derived.maxSector.angle + 5) - X(derived.maxSector.angle - 5), h - T - Bm);
    }
    ctx.font = "8.5px IBM Plex Mono, monospace";
    ctx.strokeStyle = "rgba(29,48,80,0.9)";
    ctx.fillStyle = "#42567a";
    for (let g = 0; g <= 4; g++) {
      const v = minI + ((maxI - minI) * g) / 4;
      const y = Y(v);
      ctx.beginPath();
      ctx.moveTo(L, y);
      ctx.lineTo(w - Rg, y);
      ctx.stroke();
      ctx.textAlign = "right";
      ctx.fillText(v.toFixed(2), L - 4, y + 3);
    }
    ctx.textAlign = "center";
    for (let tick = 0; tick <= 6; tick++) {
      const a = minAngle + (maxAngle - minAngle) * tick / 6;
      ctx.fillText(`${a.toFixed(maxAngle - minAngle < 25 ? 1 : 0)}°`, X(a), h - 7);
    }
    // El lienzo no recorta automáticamente. Sin este clip, los puntos fuera
    // de los nuevos límites de datos del zoom generan "peines" en los bordes.
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, T, w - L - Rg, h - T - Bm);
    ctx.clip();
    if (data && data.factor > 1) {
      ctx.strokeStyle = "rgba(76,201,240,0.85)";
      ctx.lineWidth = 1;
      const errorStride = Math.max(1, Math.ceil(data.length / Math.max(40, w / 12)));
      for (let i = 0; i < data.length; i += errorStride) {
        const phase = cartesianAngle(data.angles[i]);
        if (phase < minAngle || phase > maxAngle) continue;
        const x = X(phase);
        const y = Y(data.amps[i]);
        const y0 = Y(data.amps[i] - data.ampsErr[i]);
        const y1 = Y(data.amps[i] + data.ampsErr[i]);
        const x0 = X(Math.max(minAngle, phase - data.angleErr[i]));
        const x1 = X(Math.min(maxAngle, phase + data.angleErr[i]));
        ctx.beginPath();
        ctx.moveTo(x, y0);
        ctx.lineTo(x, y1);
        ctx.moveTo(x - 2.5, y0);
        ctx.lineTo(x + 2.5, y0);
        ctx.moveTo(x - 2.5, y1);
        ctx.lineTo(x + 2.5, y1);
        ctx.moveTo(x0, y);
        ctx.lineTo(x1, y);
        ctx.moveTo(x0, y - 2.5);
        ctx.lineTo(x0, y + 2.5);
        ctx.moveTo(x1, y - 2.5);
        ctx.lineTo(x1, y + 2.5);
        ctx.stroke();
      }
    }
    const plotRevision = (color: string, rev?: number) => {
      if (!data) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      let started = false;
      let previousPhase: number | null = null;
      const stride = renderStride(data.length, w);
      for (let i = 0; i < data.length; i += stride) {
        if (rev !== undefined && data.revs[i] !== rev) {
          started = false;
          previousPhase = null;
          continue;
        }
        const phase = cartesianAngle(data.angles[i]);
        if (phase < minAngle || phase > maxAngle || !Number.isFinite(data.amps[i])) {
          started = false;
          previousPhase = null;
          continue;
        }
        const x = X(phase);
        const y = Y(data.amps[i]);
        if (!started || (previousPhase !== null && Math.abs(phase - previousPhase) > 180)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        started = true;
        previousPhase = phase;
      }
      ctx.stroke();
    };
    const plotSeries = (series: { angles: number[]; currents: number[]; angleErr: number[]; currentErr: number[] }, color: string, width: number, errors: boolean) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      let previousPhase: number | null = null;
      const stride = renderStride(series.currents.length, w);
      for (let i = 0; i < series.currents.length; i += stride) {
        const current = series.currents[i];
        const phase = cartesianAngle(series.angles[i]);
        if (phase < minAngle || phase > maxAngle || !Number.isFinite(current)) {
          started = false;
          previousPhase = null;
          continue;
        }
        const x = X(phase);
        const y = Y(current);
        if (!started || (previousPhase !== null && Math.abs(phase - previousPhase) > 180)) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        started = true;
        previousPhase = phase;
      }
      ctx.stroke();
      if (!errors) return;
      ctx.lineWidth = 0.8;
      const errorStride = Math.max(stride, Math.ceil(series.currents.length / Math.max(40, w / 12)));
      for (let i = 0; i < series.currents.length; i += errorStride) {
        const phase = cartesianAngle(series.angles[i]);
        if (phase < minAngle || phase > maxAngle || !Number.isFinite(series.currents[i])) continue;
        const x = X(phase), y = Y(series.currents[i]);
        const y0 = Y(series.currents[i] - series.currentErr[i]);
        const y1 = Y(series.currents[i] + series.currentErr[i]);
        const x0 = X(Math.max(minAngle, phase - series.angleErr[i]));
        const x1 = X(Math.min(maxAngle, phase + series.angleErr[i]));
        ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke();
      }
    };
    if (extendedDisplaySeries.length) {
      activeExtendedSeries.forEach((series) => plotSeries(series, series.color, 1.4, flip.avgFactor > 1));
      if (flip.capturing) plotRevision("rgba(245,165,36,0.75)");
      if (extendedMeanProfile && showExtendedMean) {
        const meanSeries = {
          angles: extendedMeanProfile.currentA.map((_, index) => index + 0.5),
          currents: extendedMeanProfile.currentA.map((value) => value ?? NaN),
          angleErr: extendedMeanProfile.angleErr,
          currentErr: extendedMeanProfile.currentErr,
        };
        const valid = meanSeries.currents.map(Number.isFinite);
        const compact = {
          angles: meanSeries.angles.filter((_, index) => valid[index]),
          currents: meanSeries.currents.filter(Number.isFinite),
          angleErr: meanSeries.angleErr.filter((_, index) => valid[index]),
          currentErr: meanSeries.currentErr.filter((_, index) => valid[index]),
        };
        const meanCopies = independentRevs && data
          ? [{
              angles: Array.from(data.angles),
              currents: Array.from(data.amps),
              angleErr: Array.from(data.angleErr),
              currentErr: Array.from(data.ampsErr),
            }]
          : [compact];
        meanCopies.forEach((series) => plotSeries(series, "rgba(240,245,255,0.62)", 2.4, false));
        ctx.strokeStyle = "rgba(240,245,255,0.6)";
        ctx.lineWidth = 0.8;
        const pixelsPerDegree = (w - L - Rg) / Math.max(1, maxAngle - minAngle);
        const barStride = Math.max(1, Math.floor(12 / Math.max(0.1, pixelsPerDegree)));
        for (const series of meanCopies) {
          for (let i = 0; i < series.currents.length; i += barStride) {
            if (series.angles[i] < minAngle || series.angles[i] > maxAngle) continue;
            const x = X(series.angles[i]);
            const y = Y(series.currents[i]);
            const y0 = Y(series.currents[i] - series.currentErr[i]);
            const y1 = Y(series.currents[i] + series.currentErr[i]);
            const x0 = X(Math.max(minAngle, series.angles[i] - series.angleErr[i]));
            const x1 = X(Math.min(maxAngle, series.angles[i] + series.angleErr[i]));
            ctx.beginPath();
            ctx.moveTo(x, y0); ctx.lineTo(x, y1);
            ctx.moveTo(x - 2, y0); ctx.lineTo(x + 2, y0);
            ctx.moveTo(x - 2, y1); ctx.lineTo(x + 2, y1);
            ctx.moveTo(x0, y); ctx.lineTo(x1, y);
            ctx.moveTo(x0, y - 2); ctx.lineTo(x0, y + 2);
            ctx.moveTo(x1, y - 2); ctx.lineTo(x1, y + 2);
            ctx.stroke();
          }
        }
      }
    } else if (flip.overlayRevs && data) {
      const lastRev = data.revs[data.length - 1] ?? 0;
      for (let rev = 0; rev <= Math.min(lastRev, 11); rev++) plotRevision(REV_COLORS[rev % REV_COLORS.length], rev);
    } else plotRevision("rgba(245,165,36,0.95)");
    ctx.restore();
  };

  /* ── dibujo: FFT ─────────────────────────────────────── */
  const drawFft = (ctx: CanvasRenderingContext2D, w: number, h: number, viewport = RESET_VIEWPORT) => {
    ctx.clearRect(0, 0, w, h);
    const mag = derived?.mag;
    ctx.font = "8.5px IBM Plex Mono, monospace";
    const drawFrequencyTicks = (minHz: number, maxHz: number, X: (hz: number) => number) => {
      const ticks = 6;
      ctx.strokeStyle = "rgba(29,48,80,0.9)";
      ctx.fillStyle = "#42567a";
      ctx.lineWidth = 1;
      ctx.textAlign = "center";
      for (let tick = 0; tick <= ticks; tick++) {
        const hz = minHz + (maxHz - minHz) * tick / ticks;
        const x = X(hz);
        ctx.beginPath();
        ctx.moveTo(x, h - 18);
        ctx.lineTo(x, h - 14);
        ctx.stroke();
        ctx.fillText(`${hz.toFixed(maxHz - minHz < 10 ? 2 : 1)}`, x, h - 6);
      }
    };
    if (extendedFftSeries.length) {
      const visible = overlayFftSeries
        ? extendedFftSeries
        : extendedFftSeries.filter((series) => series.id === selectedFftSeries);
      const spectra = visible.length ? visible : [extendedFftSeries[0]];
      const L = 10, Bm = 18;
      const fullMaxHz = Math.max(...spectra.map((series) => (series.spectrum.magnitude.length - 1) * series.spectrum.dfHz));
      let maxMagnitude = 0;
      for (const series of spectra) for (let i = 2; i < series.spectrum.magnitude.length; i++) maxMagnitude = Math.max(maxMagnitude, series.spectrum.magnitude[i]);
      const minHz = viewport.x0 * fullMaxHz;
      const maxHz = viewport.x1 * fullMaxHz;
      const minMagnitude = (1 - viewport.y1) * maxMagnitude;
      const viewMaxMagnitude = (1 - viewport.y0) * maxMagnitude;
      const X = (hz: number) => L + ((hz - minHz) / (maxHz - minHz || 1)) * (w - L * 2);
      const Y = (value: number) => h - Bm - Math.sqrt(Math.max(0, (value - minMagnitude) / (viewMaxMagnitude - minMagnitude || 1))) * (h - Bm - 12);
      ctx.save();
      ctx.beginPath();
      ctx.rect(L, 12, w - L * 2, h - Bm - 12);
      ctx.clip();
      for (const series of spectra) {
        ctx.strokeStyle = series.id === "average" ? "rgba(240,245,255,0.78)" : series.color;
        ctx.lineWidth = series.id === "average" ? 2.4 : 1.2;
        ctx.globalAlpha = overlayFftSeries && series.id !== "average" ? 0.65 : 1;
        ctx.beginPath();
        let started = false;
        for (let i = 2; i < series.spectrum.magnitude.length; i++) {
          const hz = i * series.spectrum.dfHz;
          if (hz < minHz || hz > maxHz) { started = false; continue; }
          const x = X(hz), y = Y(series.spectrum.magnitude[i]);
          if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      drawFrequencyTicks(minHz, maxHz, X);
      ctx.fillStyle = "#42567a"; ctx.textAlign = "right"; ctx.fillText("Hz", w - L, 10);
      return;
    }
    if (!mag || !derived) {
      ctx.fillStyle = "#42567a";
      ctx.textAlign = "center";
      ctx.fillText("captura demasiado corta para FFT", w / 2, h / 2);
      return;
    }
    const L = 10;
    const Bm = 18;
    /* Mostrar el espectro completo hasta Nyquist. Antes se dibujaba sólo el
     * 60 %, aunque la tabla buscaba picos en el 100 % del espectro. */
    const usable = mag.length;
    let mx = 0;
    for (let i = 2; i < usable; i++) if (mag[i] > mx) mx = mag[i];
    const fullMaxHz = (usable - 1) * derived.df;
    const minHz = viewport.x0 * fullMaxHz;
    const maxHz = viewport.x1 * fullMaxHz;
    const minMagnitude = (1 - viewport.y1) * mx;
    const maxMagnitude = (1 - viewport.y0) * mx;
    const X = (i: number) => L + ((i * derived.df - minHz) / (maxHz - minHz || 1)) * (w - L * 2);
    const Y = (v: number) => h - Bm - Math.sqrt(Math.max(0, (v - minMagnitude) / (maxMagnitude - minMagnitude || 1))) * (h - Bm - 12);
    ctx.save();
    ctx.beginPath();
    ctx.rect(L, 12, w - L * 2, h - Bm - 12);
    ctx.clip();
    ctx.fillStyle = "rgba(76,201,240,0.5)";
    const bw = Math.max(1, (w - L * 2) / usable - 0.5);
    for (let i = 2; i < usable; i++) {
      const hz = i * derived.df;
      if (hz < minHz || hz > maxHz) continue;
      const y = Y(mag[i]);
      ctx.fillRect(X(i), y, bw, h - Bm - y);
    }
    ctx.restore();
    drawFrequencyTicks(minHz, maxHz, (hz) => X(hz / derived.df));
    ctx.fillStyle = "#42567a";
    ctx.textAlign = "right";
    ctx.fillText("Hz", w - L, 10);
    for (const p of derived.peaks) {
      if (p.bin >= usable) continue;
      ctx.fillStyle = "#f5a524";
      ctx.beginPath();
      ctx.arc(X(p.bin), Y(p.mag), 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.fillText(`${p.freq.toFixed(2)}Hz`, X(p.bin), Y(p.mag) - 6);
    }
    for (const p of selectedPeaks) {
      if (p.bin >= usable) continue;
      ctx.strokeStyle = "#ff5d5d";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(X(p.bin), Y(p.mag), 6, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  const pickFft = (x: number) => {
    const spectrum = extendedFftSeries.length
      ? extendedFftSeries.find((series) => series.id === selectedFftSeries)?.spectrum
      : derived?.mag ? { magnitude: Array.from(derived.mag), dfHz: derived.df } : null;
    if (!spectrum) return;
    const mag = spectrum.magnitude;
    const center = Math.max(2, Math.min(mag.length - 2, Math.round(x * mag.length)));
    const radius = Math.max(8, Math.round(mag.length * 0.008));
    let bin = center;
    for (let i = Math.max(2, center - radius); i <= Math.min(mag.length - 2, center + radius); i++) {
      if (mag[i] > mag[bin]) bin = i;
    }
    const freq = bin * spectrum.dfHz;
    const peak = { bin, freq, period: 1 / freq, mag: mag[bin] };
    updateSelectedPeaks((current) =>
      current.some((item) => item.bin === bin) ? current : [...current, peak].sort((a, b) => a.freq - b.freq),
    );
  };

  const pickMountPosition = (kind: "polar" | "cartesiano", x: number, y: number, clientX: number, clientY: number) => {
    if (!derived?.plot?.length) return;
    const absoluteAngle = kind === "polar"
      ? ((Math.atan2(x - 0.5, -(y - 0.5)) * 180) / Math.PI + 360) % 360
      : Math.min(cartesianFullAngleDeg, Math.max(0,
          (viewports.cartesiano.x0 + ((x - 0.04) / 0.95) * (viewports.cartesiano.x1 - viewports.cartesiano.x0)) * cartesianFullAngleDeg,
        ));
    const angle = ((absoluteAngle % 360) + 360) % 360;
    setMovePrompt({
      angle,
      x: Math.min(clientX + 10, window.innerWidth - 270),
      y: Math.min(clientY + 10, window.innerHeight - 105),
    });
  };

  const renderPng = async (draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) => {
    const canvas = document.createElement("canvas");
    canvas.width = 1400;
    canvas.height = 800;
    const ctx = canvas.getContext("2d")!;
    draw(ctx, canvas.width, canvas.height);
    ctx.save();
    ctx.globalCompositeOperation = "destination-over";
    ctx.fillStyle = "#081120";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.restore();
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((value) => (value ? resolve(value) : reject(new Error("No se pudo crear PNG"))), "image/png"),
    );
    return new Uint8Array(await blob.arrayBuffer());
  };

  const exportAll = async () => {
    if (!derived) return void flip.exportBundle();
    const [live, polar, cart, fft] = await Promise.all([
      renderPng(drawLive),
      renderPng(drawPolar),
      renderPng(drawCart),
      renderPng(drawFft),
    ]);
    const metaAxis = flip.captureMetadata.axis === 1 ? "AR" : flip.captureMetadata.axis === 2 ? "DEC" : "unknown";
    const metaDirection = flip.captureMetadata.direction?.toUpperCase() ?? "unknown";
    let peaksCsv = `# axis=${metaAxis}\n# direction=${metaDirection}\nsource,frequency_hz,period_s,period_mount_deg,magnitude\n`;
    for (const [source, peak] of [
      ...derived.peaks.map((peak, index) => [`automatic_A${index + 1}`, peak] as const),
      ...selectedPeaks.map((peak, index) => [`manual_M${index + 1}`, peak] as const),
    ]) {
      peaksCsv += `${source},${peak.freq.toFixed(9)},${peak.period.toFixed(9)},${
        derived.st.feedbackSpeedDegS ? (peak.period * derived.st.feedbackSpeedDegS).toFixed(9) : ""
      },${peak.mag.toExponential(9)}\n`;
    }
    const aiFiles = currentAiAnalyses.map((analysis) => {
      const safeName = analysis.providerName.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-|-$/g, "") || "ia";
      return { name: `analisis-ia/${safeName}.txt`, data: analysis.text };
    });
    await flip.exportBundle([
      { name: "graficas/corriente-tiempo.png", data: live },
      { name: "graficas/polar-elipse.png", data: polar },
      { name: "graficas/cartesiana.png", data: cart },
      { name: "graficas/fft.png", data: fft },
      ...(!flip.extendedAnalysis ? [{ name: "datos/fft-picos.csv", data: peaksCsv }] : []),
      ...aiFiles,
    ]);
  };

  const chartFor = useMemo(() => {
    const renderToken = [
      view, n, flip.tick, flip.avgFactor, Number(flip.overlayRevs), Number(flip.capturing),
      selectedFftSeries, Number(overlayFftSeries), Number(showExtendedMean),
      [...hiddenExtendedSeries].sort().join(","), selectedPeaks.length,
    ].join("|");
    const interaction = {
      viewport: viewports[view],
      onViewport: setViewport,
      onCursor: updateCursor,
      onCursorLeave: () => setCursorLabel(""),
      cursorLabel,
      regionZoom,
      onRegionZoomDone: () => setRegionZoom(false),
      renderToken,
    };
    switch (view) {
      case "polar":
        return <ChartCanvas draw={drawPolar} className="h-[46dvh] min-h-[300px]" onPick={(x, y, cx, cy) => pickMountPosition("polar", x, y, cx, cy)} {...interaction} />;
      case "cartesiano":
        return <ChartCanvas draw={drawCart} className="h-[46dvh] min-h-[300px]" onPick={(x, y, cx, cy) => pickMountPosition("cartesiano", x, y, cx, cy)} {...interaction} />;
      case "fft":
        return <ChartCanvas draw={drawFft} className="h-[46dvh] min-h-[300px]" onPick={(x) => pickFft(x)} {...interaction} />;
      default:
        return <ChartCanvas draw={drawLive} className="h-[46dvh] min-h-[300px]" {...interaction} />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, derived, n, flip.tick, flip.overlayRevs, flip.capturing, flip.extendedAnalysis, extendedMeanProfile, selectedEllipse, polarLoadAnalysis, hiddenExtendedSeries, showExtendedMean, extendedFftSeries, selectedFftSeries, overlayFftSeries, regionZoom, viewports, selectedPeaks, cursorLabel]);

  const selCls =
    "rounded border border-line bg-[#0c1930] px-1.5 py-1 font-mono text-[10.5px] text-fog focus:border-ion/60 focus:outline-none disabled:opacity-40";

  return (
    <section
      className="brackets rise relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-line bg-panel shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_10px_34px_rgba(0,0,0,0.4)]"
      style={{ animationDelay: "30ms" }}
    >
      {/* cabecera: estado; los parámetros y START viven solo en el panel derecho */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line bg-[#0a1424] px-3 py-2">
        <span
          className={`led ${
            flip.connected ? "led-mint led-breathe" : "led-off"
          }`}
        />
        <span className="font-display text-[11px] font-bold tracking-[0.24em] text-fog">
          TEST EJES
        </span>
        <span className="hidden font-mono text-[9.5px] text-dim md:inline">
          {flip.connected
            ? `ADC conectado por ${flip.transport?.toUpperCase()}`
            : "Flipper sin conectar (Ajustes → Conexión Flipper)"}
        </span>
        <span className="ml-auto font-mono text-[9.5px] text-dim">
          {flip.capturing ? `● REC · ${flip.rate} Hz` : "IDLE"}
        </span>
      </div>

      {/* subpestañas de visualización */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line bg-[#0a1424]/60 px-3 py-1.5">
        {visibleViews.map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={`rounded px-2.5 py-1 font-display text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
              view === v.id
                ? "bg-ion/15 text-ion shadow-[inset_0_-2px_0_rgba(76,201,240,0.8)]"
                : "text-dim hover:bg-white/[0.03] hover:text-fog"
            }`}
          >
            {v.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <label className="hidden items-center gap-1.5 font-mono text-[10px] text-dim sm:flex">
            media móvil ×
            <input
              type="number"
              min={1}
              max={100000}
              step={1}
              list="average-presets"
              aria-label="Muestras por ventana de media móvil"
              value={flip.avgFactor}
              onChange={(event) => {
                const next = Math.floor(Number(event.target.value));
                if (next >= 1 && next <= 100000) flip.setAvgFactor(next);
              }}
              className={`${selCls} w-20 tabular-nums`}
            />
            <datalist id="average-presets">{AVGS.map((value) => <option key={value} value={value} />)}</datalist>
          </label>
          {!isExtendedTest && basicPasses.length > 1 && <label
            className="hidden cursor-pointer items-center gap-1.5 font-mono text-[10px] text-dim md:flex"
            title="Activada: las revoluciones se consideran independientes, se superponen en 0–360° y se promedian. Desactivada: forman una serie continua en 0–360°, 360–720°…; la FFT y las estadísticas usan la adquisición concatenada."
          >
            <input
              type="checkbox"
              checked={flip.overlayRevs}
              onChange={(e) => flip.setOverlayRevs(e.target.checked)}
              className="accent-[#f5a524]"
            />
            revs. independientes
          </label>}
          {view !== "stats" && view !== "ai" && (
            <>
              <button
                onClick={() => setRegionZoom((active) => !active)}
                className={`rounded border px-2 py-1 font-display text-[9px] font-bold tracking-wider ${
                  regionZoom ? "border-ion/60 bg-ion/15 text-ion" : "border-line text-dim hover:text-fog"
                }`}
              >
                <IconZoom className="h-3 w-3" /> AMPLIAR ÁREA
              </button>
              <button onClick={resetView} className="rounded border border-line px-2 py-1 font-display text-[9px] font-bold tracking-wider text-dim hover:border-ember/50 hover:text-ember">
                RESTAURAR
              </button>
            </>
          )}
          {!serialOpen && <span className="font-mono text-[10px] text-alert">sin montura</span>}
        </div>
      </div>

      {/* chips en vivo */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 px-3 pt-2 font-mono text-[10px]">
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px">
          <span className="text-dim">muestras </span>
          <span className="tabular-nums text-fog">{n.toLocaleString("es-ES")}</span>
        </span>
        {(view === "stats" || view === "fft") && basicPasses.length > 1 && !isExtendedTest && (
          <span
            className="rounded border border-ion/40 bg-ion/5 px-1.5 py-px text-ion"
            title={independentRevs ? "Serie continua: estadísticas y FFT calculadas sobre todas las revoluciones concatenadas." : "Revoluciones independientes superpuestas: estadísticas y FFT promediadas entre vueltas sobre 0–360°."}
          >
            {independentRevs ? "SERIE CONTINUA" : "REVS. INDEPENDIENTES · SUPERPUESTAS"}
          </span>
        )}
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px">
          <span className="text-dim">I </span>
          <span className="tabular-nums text-ember">{stats.lastA.toFixed(3)} A</span>
        </span>
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px" title="Valor eficaz móvil de los últimos 0,5 segundos">
          <span className="text-dim">I RMS </span>
          <span className="tabular-nums text-ion">{stats.rmsHalfSecond.toFixed(3)} A</span>
        </span>
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px">
          <span className="text-dim">revs </span>
          <span className="tabular-nums text-mint">{stats.revs}</span>
        </span>
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px">
          <span className={flip.capturing ? "text-ember" : "text-dim"}>
            {flip.capturing ? "● REC" : "IDLE"}
          </span>
        </span>
      </div>

      {flip.notice && (
        <div className="mx-3 mt-2 flex shrink-0 items-start gap-2 rounded border border-ember/40 bg-ember/5 px-3 py-2 font-mono text-[10.5px] text-[#ffd9a0]">
          <IconAlert className="mt-px h-3.5 w-3.5 shrink-0 text-ember" /> {flip.notice}
        </div>
      )}

      {/* zona de gráfico / estadísticas */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {view === "ai" ? (
          <AiAnalysisPanel prompt={aiPrompt} />
        ) : view !== "stats" ? (
          <div className="flex min-h-[300px] flex-col gap-2">
            {(view === "polar" || view === "cartesiano") && extendedDisplaySeries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[9px]">
                <span className="mr-1 uppercase tracking-wider text-dim">Series · pulsa para ocultar/mostrar</span>
                {extendedDisplaySeries.map((series) => {
                  const hidden = hiddenExtendedSeries.has(series.id);
                  return (
                    <button
                      key={series.id}
                      onClick={() => setHiddenExtendedSeries((current) => {
                        const next = new Set(current);
                        hidden ? next.delete(series.id) : next.add(series.id);
                        return next;
                      })}
                      className={`rounded border px-2 py-0.5 transition-opacity ${hidden ? "border-line opacity-35" : "border-current"}`}
                      style={{ color: series.color }}
                    >
                      ● {series.label}
                    </button>
                  );
                })}
                {extendedMeanProfile && (
                  <button
                    onClick={() => setShowExtendedMean((visible) => !visible)}
                    className={`rounded border border-fog px-2 py-0.5 text-fog transition-opacity ${showExtendedMean ? "opacity-80" : "opacity-35"}`}
                  >
                    ━ {independentRevs ? "SERIE UNIDA" : "PROMEDIO"}
                  </button>
                )}
              </div>
            )}
            {view === "fft" && extendedFftSeries.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 rounded border border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[9px]">
                <span className="mr-1 uppercase tracking-wider text-dim">Espectro mostrado</span>
                {extendedFftSeries.map((series) => (
                  <button
                    key={series.id}
                    onClick={() => { setSelectedFftSeries(series.id); setOverlayFftSeries(false); }}
                    className={`rounded border px-2 py-0.5 ${!overlayFftSeries && selectedFftSeries === series.id ? "border-current opacity-100" : "border-line opacity-45"}`}
                    style={{ color: series.color }}
                  >
                    ● {series.label}
                  </button>
                ))}
                <button
                  onClick={() => setOverlayFftSeries((value) => !value)}
                  className={`rounded border px-2 py-0.5 text-ion ${overlayFftSeries ? "border-ion opacity-100" : "border-line opacity-50"}`}
                >
                  SUPERPONER TODO
                </button>
              </div>
            )}
            {chartFor}
            {view === "fft" && derived && (
              <div className="overflow-hidden rounded border border-line">
                <p className="border-b border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[9px] text-dim">
                  {extendedFftSeries.length
                    ? "5 picos principales del espectro seleccionado + selecciones manuales · pulsa sobre el espectro para añadir"
                    : "5 picos principales automáticos + selecciones manuales · pulsa sobre el espectro para añadir"}
                </p>
                <table className="w-full font-mono text-[10px]">
                  <thead>
                    <tr className="bg-[#0c1930] text-left text-[8.5px] uppercase tracking-wider text-dim">
                      <th className="px-2 py-1">#</th>
                      <th className="px-2 py-1">frecuencia</th>
                      <th className="px-2 py-1">periodo</th>
                      <th className="px-2 py-1">cada (montura)</th>
                      <th className="px-2 py-1 text-right">magnitud</th>
                      <th className="w-8 px-2 py-1" />
                    </tr>
                  </thead>
                  <tbody>
                    {displayedFftPeaks.map((p, i) => (
                      <tr key={`auto-${p.bin}`} className="border-t border-line/60 text-fog">
                        <td className="px-2 py-1 text-ember">A{i + 1}</td>
                        <td className="px-2 py-1 tabular-nums" title={`Resolución FFT Δf=${displayedFftDfHz.toPrecision(4)} Hz`}>
                          {p.freq.toFixed(3)} ± {(displayedFftDfHz / 2).toPrecision(2)} Hz
                        </td>
                        <td className="px-2 py-1 tabular-nums">
                          {p.period >= 1 ? `${p.period.toFixed(3)} s` : `${(p.period * 1000).toFixed(1)} ms`}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-ion">
                          {displayedFftSpeed
                            ? `${(p.period * displayedFftSpeed).toFixed(3)}°`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-dim">{p.mag.toExponential(2)}</td>
                        <td className="px-2 py-1 text-center text-dim" title="Pico automático">auto</td>
                      </tr>
                    ))}
                    {selectedPeaks.map((p, i) => (
                      <tr key={`manual-${p.bin}`} className="border-t border-line/60 text-fog">
                        <td className="px-2 py-1 text-alert">M{i + 1}</td>
                        <td className="px-2 py-1 tabular-nums">{p.freq.toFixed(3)} Hz</td>
                        <td className="px-2 py-1 tabular-nums">
                          {p.period >= 1 ? `${p.period.toFixed(3)} s` : `${(p.period * 1000).toFixed(1)} ms`}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-ion">
                          {displayedFftSpeed
                            ? `${(p.period * displayedFftSpeed).toFixed(3)}°`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-dim">
                          {p.mag.toExponential(2)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            title="Quitar pico"
                            aria-label={`Quitar pico ${p.freq.toFixed(3)} Hz`}
                            onClick={() => updateSelectedPeaks((items) => items.filter((item) => item.bin !== p.bin))}
                            className="text-dim hover:text-alert"
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                    {!selectedPeaks.length && <tr><td colSpan={6} className="px-2 py-2 text-center text-dim">Sin selecciones manuales.</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
            {view === "fft" && derived && (
              <p className="font-mono text-[9.5px] text-dim">
                Espectro · {derived.st.durS.toFixed(1)} s de señal · resolución {displayedFftDfHz.toFixed(3)} Hz · ventana de Hann · grados calculados con el feedback de posición de la montura
                {extendedFftSeries.length && fftReferenceSpeed ? ` · pasadas móviles en dominio angular referidas a ${fftReferenceSpeed.toFixed(4)} °/s` : ""}
              </p>
            )}
            {view === "fft" && flip.extendedAnalysis && (
              <div className="overflow-hidden rounded border border-ion/35">
                <p className="border-b border-line bg-ion/5 px-2 py-1.5 font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-ion">
                  Comparación del test extendido · {flip.extendedAnalysis.passes.length} fases completadas
                </p>
                <p className="border-b border-line px-2 py-1.5 font-mono text-[9px] text-dim">
                  Cada coincidencia reúne picos de distintas pasadas que conservan aproximadamente sus Hz o su periodicidad en grados. Se analizan hasta 40 máximos locales por pasada, no sólo los cinco destacados en la gráfica.
                </p>
                <table className="w-full font-mono text-[9.5px]">
                  <thead className="bg-[#0c1930] text-left text-[8.5px] uppercase tracking-wider text-dim">
                    <tr><th className="px-2 py-1">coincidencia</th><th className="px-2 py-1">clasificación</th><th className="px-2 py-1">Hz</th><th className="px-2 py-1">cada °</th><th className="px-2 py-1">pasadas</th><th className="px-2 py-1">evidencia</th></tr>
                  </thead>
                  <tbody>
                    {flip.extendedAnalysis.groups.map((group, index) => (
                      <tr key={group.id} className="border-t border-line/60 text-fog">
                        <td className="px-2 py-1 text-ember">C{index + 1}</td>
                        <td className={`px-2 py-1 ${group.classification === "mecánica" ? "text-mint" : group.classification === "eléctrica/muestreo" ? "text-ion" : "text-fog"}`}>{group.classification}</td>
                        <td className="px-2 py-1 tabular-nums">{group.representativeHz.toFixed(3)}</td>
                        <td className="px-2 py-1 tabular-nums">{group.representativeDeg !== null ? `${group.representativeDeg.toFixed(3)}°` : "—"}</td>
                        <td className="px-2 py-1 tabular-nums">{group.passes.length}</td>
                        <td className="px-2 py-1 text-dim" title={group.passes.join(" · ")}>{group.reason}{group.harmonicOfHz ? ` Armónico de ≈${group.harmonicOfHz.toFixed(3)} Hz.` : ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="border-t border-line p-2">
                  {flip.extendedAnalysis.passes.map((pass, passIndex) => (
                    <details key={pass.id} className="mb-1 rounded border border-line/70 bg-[#091426] last:mb-0">
                      <summary className="cursor-pointer px-2 py-1.5 font-mono text-[9.5px] text-fog">
                        <span style={{ color: REV_COLORS[passIndex % REV_COLORS.length] }}>●</span> {pass.label} · {pass.peaks.length} frecuencias detectadas
                      </summary>
                      <div className="max-h-48 overflow-y-auto border-t border-line/60 p-2 font-mono text-[9px] text-dim">
                        {pass.peaks.map((peak, peakIndex) => (
                          <span key={`${pass.id}-${peakIndex}`} className="mr-3 inline-block py-0.5 tabular-nums">
                            {peak.frequencyHz.toFixed(3)} ± {(peak.uncertaintyHz ?? (pass.spectrum?.dfHz ?? 0) / 2).toPrecision(2)} Hz · {peak.periodMountDeg !== null ? `${peak.periodMountDeg.toFixed(3)}°` : "—"} · {peak.magnitude.toExponential(2)}
                          </span>
                        ))}
                      </div>
                    </details>
                  ))}
                </div>
                <p className="border-t border-line px-2 py-1.5 font-mono text-[9px] text-dim">Clasificación orientativa: confirma repitiendo el ensayo y comparando amplitud/fase; no identifica automáticamente una pieza.</p>
              </div>
            )}
          </div>
        ) : !derived && !extendedSummary ? (
          <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">
            Sin datos todavía: captura, importa un CSV o carga una sesión.
          </p>
        ) : extendedSummary ? (
          <div className="space-y-2">
            <StatSection
              title={independentRevs ? "Resumen de la serie unida" : isExtendedTest ? "Resumen medio del test extendido" : "Resumen medio del test básico"}
              subtitle={independentRevs
                ? `${comparisonPasses.length} revoluciones consecutivas · estadísticas sobre la adquisición completa`
                : isExtendedTest
                ? `${comparisonPasses.length} fases terminadas · ± = incertidumbre estándar entre las vueltas`
                : `${comparisonPasses.length} ${comparisonPasses.length === 1 ? "revolución" : "revoluciones"} · ± = incertidumbre estándar entre vueltas`}
            >
              <StatCell k="corriente media" v={`${extendedSummary.current.mean.toFixed(5)} ± ${extendedSummary.current.uncertainty.toFixed(5)} A`} tone="text-mint" />
              <StatCell k="N total" v={extendedSummary.totalSamples.toLocaleString("es-ES")} />
              <StatCell k="tiempo total adquisición" v={`${extendedSummary.totalDurationS.toFixed(1)} s`} />
              <StatCell k={independentRevs ? "tasa ADC efectiva" : "tasa ADC media"} v={independentRevs ? `${extendedSummary.rate.mean.toFixed(1)} Hz` : `${extendedSummary.rate.mean.toFixed(1)} ± ${extendedSummary.rate.uncertainty.toFixed(1)} Hz`} />
              <StatCell k={independentRevs ? "velocidad de la serie" : "velocidad media"} v={independentRevs ? `${extendedSummary.speed.mean.toFixed(4)} °/s` : `${extendedSummary.speed.mean.toFixed(4)} ± ${extendedSummary.speed.uncertainty.toFixed(4)} °/s`} tone="text-ion" />
              <StatCell k="máximo global" v={`${extendedSummary.maxA.toFixed(4)} A`} tone="text-ember" />
              <StatCell k={independentRevs ? "concentración R̄" : "concentración R̄ media"} v={independentRevs ? extendedSummary.circularR.mean.toFixed(4) : `${extendedSummary.circularR.mean.toFixed(4)} ± ${extendedSummary.circularR.uncertainty.toFixed(4)}`} tone="text-ion" />
              {extendedSummary.direction && <StatCell k="dirección de carga media" v={`${extendedSummary.direction.mean.toFixed(2)}° ± ${extendedSummary.direction.uncertainty.toFixed(2)}°${extendedSummary.circularR.mean < 0.05 ? " · no representativa" : ""}`} tone="text-ion" />}
              {polarLoadAnalysis?.dominantZone && <StatCell k="zona sobre la media" v={`${polarLoadAnalysis.dominantZone.startDeg.toFixed(0)}° → ${polarLoadAnalysis.dominantZone.endDeg.toFixed(0)}° · ancho ${polarLoadAnalysis.dominantZone.widthDeg.toFixed(0)}° · ${polarLoadAnalysis.dominantZone.meanA.toFixed(4)} ± ${polarLoadAnalysis.dominantZone.uncertaintyA.toFixed(4)} A`} tone="text-ember" />}
              {extendedSummary.semiMajor && <StatCell k={independentRevs ? "semieje a" : "semieje a medio"} v={independentRevs ? `${extendedSummary.semiMajor.mean.toFixed(4)} A` : `${extendedSummary.semiMajor.mean.toFixed(4)} ± ${extendedSummary.semiMajor.uncertainty.toFixed(4)} A`} tone="text-ion" />}
              {extendedSummary.semiMinor && <StatCell k={independentRevs ? "semieje b" : "semieje b medio"} v={independentRevs ? `${extendedSummary.semiMinor.mean.toFixed(4)} A` : `${extendedSummary.semiMinor.mean.toFixed(4)} ± ${extendedSummary.semiMinor.uncertainty.toFixed(4)} A`} tone="text-ion" />}
              {extendedSummary.ellipseRatio && <StatCell k={independentRevs ? "cociente a/b" : "cociente a/b medio"} v={independentRevs ? extendedSummary.ellipseRatio.mean.toFixed(4) : `${extendedSummary.ellipseRatio.mean.toFixed(4)} ± ${extendedSummary.ellipseRatio.uncertainty.toFixed(4)}`} tone="text-ion" />}
              {extendedSummary.ellipseAngle && <StatCell k={independentRevs ? "inclinación φ" : "inclinación φ media"} v={independentRevs ? `${extendedSummary.ellipseAngle.mean.toFixed(2)}°` : `${extendedSummary.ellipseAngle.mean.toFixed(2)}° ± ${extendedSummary.ellipseAngle.uncertainty.toFixed(2)}°`} tone="text-ion" />}
            </StatSection>
            {comparisonPasses.map((pass, index) => {
              const st = pass.statistics;
              const ellipse = st.ellipse;
              return (
                <section key={pass.id} className="overflow-hidden rounded border border-line">
                  <header className="flex items-center gap-2 border-b border-line bg-[#0c1930] px-2.5 py-2">
                    <span className="h-2 w-2 rounded-full" style={{ background: REV_COLORS[index % REV_COLORS.length] }} />
                    <h3 className="font-display text-[9.5px] font-bold uppercase tracking-[0.14em] text-fog">{isExtendedTest ? `Pasada ${index + 1} · ${pass.label}` : pass.label}</h3>
                  </header>
                  <div className="space-y-1.5 bg-[#091426]/70 p-2">
                    <div className="grid grid-cols-1 gap-1.5 font-mono text-[10px] sm:grid-cols-2">
                      <StatCell k="adquisición" v={`${st.n.toLocaleString("es-ES")} mues. · ${st.durationS.toFixed(1)} s · ${st.effectiveRateHz.toFixed(1)} Hz`} />
                      <StatCell k="velocidad / recorrido" v={`${st.measuredSpeedDegS?.toFixed(4) ?? "—"} °/s · ${st.angleSpanDeg.toFixed(2)}°`} tone="text-ion" />
                      <StatCell k="media ± σ" v={`${st.meanA.toFixed(5)} ± ${st.sdA.toFixed(5)} A`} />
                      <StatCell k="media ± SEM" v={`${st.meanA.toFixed(5)} ± ${st.semA.toExponential(2)} A`} tone="text-mint" />
                      <StatCell k="mediana" v={`${st.medianA.toFixed(5)} A`} />
                      <StatCell k="pico máximo / posición" v={`${st.maxA.toFixed(4)} A · ${st.maxAngleDeg?.toFixed(2) ?? "—"}°`} tone="text-ember" />
                      <StatCell k="dirección de carga circular" v={st.circularMeanDeg !== null ? `${st.circularMeanDeg.toFixed(2)}°${(st.circularR ?? 0) < 0.05 ? " · no representativa" : ""}` : "—"} tone="text-ion" />
                      <StatCell k="concentración R̄" v={st.circularR?.toFixed(4) ?? "—"} tone="text-ion" />
                      {ellipse && <StatCell k="elipse · semiejes a / b" v={`${ellipse.semiMajor.toFixed(4)} / ${ellipse.semiMinor.toFixed(4)} A`} tone="text-ion" />}
                      {ellipse && <StatCell k="elipse · cociente a/b" v={(ellipse.semiMajor / ellipse.semiMinor).toFixed(4)} tone="text-ion" />}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        ) : derived ? (
          <div className="space-y-2">
            <StatSection title="Adquisición" subtitle="Calidad y cobertura temporal/posicional de los datos">
              <StatCell k="N (crudo / promediado)" v={`${derived.st.n.toLocaleString("es-ES")} / ${derived.st.nAvg.toLocaleString("es-ES")}`} />
              <StatCell k="tiempo real adquisición" v={`${derived.st.durS.toFixed(2)} s`} />
              <StatCell k="tasa ADC efectiva" v={`${derived.st.rateEst.toFixed(1)} Hz`} />
              <StatCell k="rendimiento solicitado/efectivo" v={`${Math.min(999, (derived.st.rateEst / flip.rate) * 100).toFixed(1)} %`} tone={derived.st.rateEst < flip.rate * 0.9 ? "text-alert" : "text-mint"} />
              {derived.st.feedbackSpeedDegS !== null && <StatCell k="velocidad medida (:j)" v={`${derived.st.feedbackSpeedDegS.toFixed(4)} °/s`} tone="text-ion" />}
              {derived.st.samplesPerDeg !== null && <StatCell k="muestras / grado medidas" v={derived.st.samplesPerDeg.toFixed(1)} tone="text-ion" />}
              <StatCell k="recorrido confirmado :j" v={`${derived.st.angleSpanDeg.toFixed(2)}°`} tone={derived.st.angleSpanDeg >= 358 ? "text-mint" : "text-alert"} />
              <StatCell k="media móvil" v={`×${flip.avgFactor}`} tone="text-ion" />
              {flip.deviceInfo && <StatCell k={`Flipper ${flip.deviceInfo.version} · OOR / OVF`} v={`${flip.deviceInfo.outOfRange} / ${flip.deviceInfo.overflow}${flip.deviceInfo.overflowDelta === null ? "" : ` · captura +${flip.deviceInfo.overflowDelta}`}`} tone={flip.deviceInfo.overflowDelta ? "text-alert" : "text-mint"} />}
            </StatSection>
            <StatSection title="Estadística básica" subtitle="Nivel, dispersión y extremos de la corriente">
              <StatCell k="media ± σ" v={`${derived.st.mean.toFixed(5)} ± ${derived.st.sd.toFixed(5)} A`} />
              <StatCell k="media ± SEM" v={`${derived.st.mean.toFixed(5)} ± ${derived.st.sem.toExponential(2)} A`} tone="text-mint" />
              <StatCell k="mediana" v={`${derived.st.median.toFixed(5)} A`} />
              <StatCell k="pico máximo / posición" v={`${derived.st.maxA.toFixed(3)} A · ${derived.st.maxAngleDeg !== null ? `${derived.st.maxAngleDeg.toFixed(2)}°` : "sin ángulo"}`} tone="text-ember" />
            </StatSection>
            <StatSection title="Estadística angular" subtitle="Distribución del esfuerzo alrededor de la corona">
              {polarLoadAnalysis?.dominantZone && <StatCell k="zona sobre la media" v={`${polarLoadAnalysis.dominantZone.startDeg.toFixed(0)}° → ${polarLoadAnalysis.dominantZone.endDeg.toFixed(0)}° · ancho ${polarLoadAnalysis.dominantZone.widthDeg.toFixed(0)}° · ${polarLoadAnalysis.dominantZone.meanA.toFixed(4)} A`} tone="text-ember" />}
              {polarLoadAnalysis && <StatCell k="dirección de carga circular" v={`${polarLoadAnalysis.circular.meanDeg.toFixed(2)}°${polarLoadAnalysis.circular.R < 0.05 ? " · no representativa" : ""}`} tone="text-ion" />}
              {polarLoadAnalysis && <StatCell k="concentración R̄" v={polarLoadAnalysis.circular.R.toFixed(4)} tone="text-ion" />}
              {polarLoadAnalysis && <StatCell k="dispersión circular σ" v={`${polarLoadAnalysis.circular.stdDeg.toFixed(2)}°`} tone="text-ion" />}
              {derived.st.dThetaEnc !== null && <StatCell k="δθ encoder (360/CPR)" v={`${derived.st.dThetaEnc.toExponential(2)}°`} tone="text-ion" />}
            </StatSection>
            {!flip.capturing && derived.ellipse && (
              <StatSection title="Ajuste elíptico" subtitle="Geometría de la nube corriente–ángulo en la vista polar">
                <StatCell k="elipse · semiejes a / b" v={`${derived.ellipse.semiMajor.toFixed(4)} / ${derived.ellipse.semiMinor.toFixed(4)} A`} tone="text-ion" />
                <StatCell k="elipse · cociente a/b" v={(derived.ellipse.semiMajor / derived.ellipse.semiMinor).toFixed(4)} tone="text-ion" />
                <StatCell k="elipse · inclinación φ" v={`${derived.ellipse.angleDeg.toFixed(2)}°`} tone="text-ion" />
                <StatCell k="elipse · centro x / y" v={`${derived.ellipse.centerX.toFixed(4)} / ${derived.ellipse.centerY.toFixed(4)} A`} tone="text-ion" />
                <StatCell k="elipse · centro polar r / θ" v={`${Math.hypot(derived.ellipse.centerX, derived.ellipse.centerY).toFixed(4)} A / ${(((Math.atan2(derived.ellipse.centerX, -derived.ellipse.centerY) * 180) / Math.PI + 360) % 360).toFixed(2)}°`} tone="text-ion" />
                <StatCell k="elipse · excentricidad / RMS" v={`${derived.ellipse.eccentricity.toFixed(4)} / ${derived.ellipse.rms.toFixed(4)}`} tone="text-ion" />
              </StatSection>
            )}
          </div>
        ) : null}

        {/* datos */}
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4d6389]">
            Datos
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <div className="relative">
              <button onClick={() => setExportMenu((open) => !open)} disabled={!derived} className="flex w-full items-center justify-center gap-1.5 rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.1em] text-fog transition-colors hover:border-ember/50 hover:text-ember">
                <IconDownload className="h-3 w-3" /> EXPORTAR (.ZIP)
              </button>
              {exportMenu && <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded border border-line bg-[#0c1930] shadow-xl">
                <button onClick={() => { setExportMenu(false); void exportAll(); }} className="w-full px-2 py-2 text-left font-mono text-[9px] text-fog hover:bg-ion/10 hover:text-ion">Sesión actual</button>
                {flip.sessions.length > 1 && <button onClick={() => { setExportMenu(false); void flip.exportSavedSessions(aiSettings.enabled); }} className="w-full border-t border-line px-2 py-2 text-left font-mono text-[9px] text-fog hover:bg-ion/10 hover:text-ion">Todas las sesiones ({flip.sessions.length})</button>}
              </div>}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.1em] text-fog transition-colors hover:border-ion/50 hover:text-ion"
            >
              <IconDownload className="h-3 w-3 rotate-180" /> IMPORTAR
            </button>
            <button
              onClick={() => void flip.saveSession(currentAiAnalyses)}
              className="flex items-center justify-center gap-1.5 rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.1em] text-fog transition-colors hover:border-mint/50 hover:text-mint"
            >
              GUARDAR SESIÓN
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void flip.importCsv(f);
              e.target.value = "";
            }}
          />

          {flip.sessions.length > 0 && (
            <div className="mt-2 flex flex-col gap-1">
              {flip.sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-[10.5px] text-fog">{s.name}</p>
                    <p className="font-mono text-[9px] text-dim">
                      {new Date(s.createdAt).toLocaleString("es-ES")} ·{" "}
                      {s.adc.length.toLocaleString("es-ES")} mues. · {s.rateHz} Hz · {s.metadata?.axis === 1 ? "AR" : s.metadata?.axis === 2 ? "DEC" : "eje ?"} · {s.metadata?.direction?.toUpperCase() ?? "sentido ?"}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      flip.loadSession(s);
                      if (aiSettings.enabled) for (const analysis of s.aiAnalyses ?? []) {
                        saveAiResponse(analysis.providerId, analysis.fingerprint, analysis.text, analysis.updatedAt);
                      }
                    }}
                    className="shrink-0 rounded border border-line px-2 py-1 font-display text-[9px] font-bold tracking-wider text-ion transition-colors hover:border-ion/50 hover:bg-ion/10"
                  >
                    CARGAR
                  </button>
                  <button
                    onClick={() => void flip.deleteSession(s.id)}
                    className="shrink-0 rounded border border-line p-1 text-dim transition-colors hover:border-alert/50 hover:text-alert"
                    title="Eliminar sesión"
                  >
                    <IconTrash className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={flip.clearData}
            disabled={!n}
            className="mt-2 w-full rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.14em] text-dim transition-colors hover:border-alert/50 hover:text-alert disabled:cursor-not-allowed disabled:opacity-35"
          >
            VACIAR MEMORIA DE TRABAJO
          </button>
        </div>
      </div>

      {movePrompt && (
        <div
          role="dialog"
          aria-label="Mover montura a la posición seleccionada"
          className="fixed z-50 w-64 rounded border border-ion/60 bg-[#0a1424] p-3 font-mono text-[10px] shadow-2xl"
          style={{ left: movePrompt.x, top: movePrompt.y }}
        >
          <p className="text-fog">Mover montura a esta posición: <span className="text-ion">{movePrompt.angle.toFixed(2)}°</span></p>
          {!canMoveToAngle && <p className="mt-1 text-alert">La montura no está disponible.</p>}
          <div className="mt-2 flex justify-end gap-2">
            <button onClick={() => setMovePrompt(null)} className="rounded border border-line px-3 py-1 text-dim hover:text-fog">NO</button>
            <button
              disabled={!canMoveToAngle}
              onClick={() => {
                onMoveToAngle(movePrompt.angle);
                setMovePrompt(null);
              }}
              className="rounded border border-ion/60 bg-ion/10 px-3 py-1 text-ion disabled:cursor-not-allowed disabled:opacity-40"
            >
              SÍ
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
