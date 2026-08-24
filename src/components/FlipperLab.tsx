import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FlipperApi } from "../hooks/useFlipper";
import {
  adcToAmps,
  AMP_PER_RAW,
  MAX_CURRENT_A,
  SHUNT_R_OHM,
  ADC_CAL_K,
} from "../lib/flipper";
import { IconAlert, IconDownload, IconTrash } from "./icons";

const AVGS = [1, 2, 5, 10, 20, 50, 100];
const REV_COLORS = [
  "rgba(76,201,240,0.5)",
  "rgba(69,224,139,0.45)",
  "rgba(174,191,220,0.4)",
  "rgba(255,157,108,0.4)",
];

type View = "vivo" | "polar" | "cartesiano" | "fft" | "stats";
type Peak = { bin: number; freq: number; period: number; mag: number };
type ChartTransform = { scale: number; x: number; y: number };
const RESET_TRANSFORM: ChartTransform = { scale: 1, x: 0, y: 0 };

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
  zoomMode,
  transform,
  onTransform,
  onPick,
}: {
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  className: string;
  zoomMode: boolean;
  transform: ChartTransform;
  onTransform: (next: ChartTransform) => void;
  onPick?: (x: number, y: number, clientX: number, clientY: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drag = useRef<{ x: number; y: number; tx: number; ty: number; moved: boolean } | null>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !cv.parentElement) return;
    const parent = cv.parentElement;
    const render = () => {
      const dpr = window.devicePixelRatio || 1;
      const renderScale = Math.min(4, Math.max(1, transform.scale));
      const w = parent.clientWidth;
      const h = parent.clientHeight;
      if (!w || !h) return;
      cv.width = Math.round(w * dpr * renderScale);
      cv.height = Math.round(h * dpr * renderScale);
      cv.style.width = `${w}px`;
      cv.style.height = `${h}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr * renderScale, dpr * renderScale);
      draw(ctx, w, h);
    };
    render();
    const ro = new ResizeObserver(render);
    ro.observe(parent);
    return () => ro.disconnect();
  });
  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, tx: transform.x, ty: transform.y, moved: false };
  };
  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.hypot(dx, dy) > 3) drag.current.moved = true;
    if (zoomMode) onTransform({ ...transform, x: drag.current.tx + dx, y: drag.current.ty + dy });
  };
  const pointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const state = drag.current;
    drag.current = null;
    if (!state?.moved && onPick) {
      const rect = event.currentTarget.getBoundingClientRect();
      onPick(
        (event.clientX - rect.left) / rect.width,
        (event.clientY - rect.top) / rect.height,
        event.clientX,
        event.clientY,
      );
    }
  };
  const wheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    if (!zoomMode) return;
    event.preventDefault();
    const parentRect = event.currentTarget.parentElement!.getBoundingClientRect();
    const px = event.clientX - parentRect.left;
    const py = event.clientY - parentRect.top;
    const scale = Math.min(4, Math.max(1, transform.scale * (event.deltaY < 0 ? 1.18 : 1 / 1.18)));
    onTransform({
      scale,
      x: px - ((px - transform.x) * scale) / transform.scale,
      y: py - ((py - transform.y) * scale) / transform.scale,
    });
  };
  return (
    <div className={`relative w-full overflow-hidden rounded border border-line bg-[#081120] ${className}`}>
      <canvas
        ref={ref}
        className={`block touch-none ${zoomMode ? "cursor-grab active:cursor-grabbing" : onPick ? "cursor-crosshair" : ""}`}
        style={{ transformOrigin: "0 0", transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.scale})` }}
        onPointerDown={pointerDown}
        onPointerMove={pointerMove}
        onPointerUp={pointerUp}
        onPointerCancel={() => (drag.current = null)}
        onWheel={wheel}
      />
    </div>
  );
}

function StatCell({ k, v, tone }: { k: string; v: ReactNode; tone?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 rounded border border-line bg-[#0c1930] px-2 py-1.5">
      <span className="text-[8.5px] uppercase tracking-wider text-dim">{k}</span>
      <span className={`tabular-nums ${tone ?? "text-fog"}`}>{v}</span>
    </div>
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
  const [zoomMode, setZoomMode] = useState(false);
  const [transforms, setTransforms] = useState<Record<View, ChartTransform>>({
    vivo: RESET_TRANSFORM,
    polar: RESET_TRANSFORM,
    cartesiano: RESET_TRANSFORM,
    fft: RESET_TRANSFORM,
    stats: RESET_TRANSFORM,
  });
  const [selectedPeaks, setSelectedPeaks] = useState<Peak[]>([]);
  const [movePrompt, setMovePrompt] = useState<{ angle: number; x: number; y: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { derived, stats } = flip;
  const n = stats.n;
  void flip.tick;
  useEffect(() => {
    if (!n) setSelectedPeaks([]);
  }, [n]);

  const setTransform = (next: ChartTransform) => setTransforms((all) => ({ ...all, [view]: next }));
  const resetView = () => setTransforms((all) => ({ ...all, [view]: RESET_TRANSFORM }));

  /* ── dibujo: vivo ────────────────────────────────────── */
  const drawLive = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    ctx.font = "9px IBM Plex Mono, monospace";
    if (!n) {
      ctx.fillStyle = "#42567a";
      ctx.textAlign = "center";
      ctx.fillText("sin muestras — START para capturar", w / 2, h / 2);
      return;
    }
    const W = Math.min(n, 2400);
    const i0 = n - W;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = i0; i < n; i++) {
      const a = adcToAmps(flip.buffers.adcRef.current[i]);
      if (a < mn) mn = a;
      if (a > mx) mx = a;
    }
    if (mx - mn < 0.01) mx = mn + 0.01;
    const pad = 14;
    ctx.strokeStyle = "rgba(245,165,36,0.9)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = i0; i < n; i++) {
      const x = ((i - i0) / (W - 1)) * (w - 8) + 4;
      const y = h - pad - ((adcToAmps(flip.buffers.adcRef.current[i]) - mn) / (mx - mn)) * (h - pad * 2);
      i === i0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.stroke();
    const ap = flip.buffers.angleRef.current;
    if (ap.length > 1) {
      const tb0 = flip.buffers.tbRef.current[i0];
      const tb1 = flip.buffers.tbRef.current[n - 1];
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
  const drawPolar = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) / 2 - 22;
    const data = derived?.plot;
    if (!data) {
      ctx.fillStyle = "#42567a";
      ctx.textAlign = "center";
      ctx.fillText("necesita ángulo de la montura durante la captura", w / 2, h / 2);
      return;
    }
    let maxI = 0.05;
    for (let i = 0; i < data.length; i++) maxI = Math.max(maxI, data.amps[i]);
    maxI *= 1.15;
    ctx.strokeStyle = "rgba(29,48,80,0.9)";
    ctx.fillStyle = "#42567a";
    ctx.font = "8.5px IBM Plex Mono, monospace";
    for (const f of [0.25, 0.5, 0.75, 1]) {
      ctx.beginPath();
      ctx.arc(cx, cy, R * f, 0, Math.PI * 2);
      ctx.stroke();
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
      ctx.strokeStyle = color;
      ctx.lineWidth = width;
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < data.length; i++) {
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
    if (flip.overlayRevs) {
      const lastRev = data.revs[data.length - 1] ?? 0;
      for (let rev = 0; rev <= Math.min(lastRev, 11); rev++) {
        plot(REV_COLORS[rev % REV_COLORS.length], 1, rev);
      }
    }
    plot("rgba(245,165,36,0.95)", 1.6);
    const fit = derived?.ellipse;
    if (fit && !flip.capturing) {
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
        `elipse a=${fit.semiMajor.toFixed(3)} A · b=${fit.semiMinor.toFixed(3)} A · φ=${fit.angleDeg.toFixed(1)}°`,
        6,
        23,
      );
    }
    ctx.fillStyle = "#f5a524";
    ctx.textAlign = "left";
    ctx.fillText(`max ${maxI.toFixed(3)} A · ${data.length.toLocaleString("es-ES")} puntos`, 6, 11);
  };

  /* ── dibujo: cartesiano con barras de error ──────────── */
  const drawCart = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const L = 46;
    const Bm = 20;
    const T = 10;
    const Rg = 10;
    const data = derived?.plot;
    if (!data) {
      ctx.fillStyle = "#42567a";
      ctx.font = "9px IBM Plex Mono, monospace";
      ctx.textAlign = "center";
      ctx.fillText("necesita ángulo de la montura durante la captura", w / 2, h / 2);
      return;
    }
    let minI = Infinity;
    let maxI = -Infinity;
    for (let i = 0; i < data.length; i++) {
      minI = Math.min(minI, data.amps[i] - data.ampsErr[i]);
      maxI = Math.max(maxI, data.amps[i] + data.ampsErr[i]);
    }
    if (!Number.isFinite(minI) || !Number.isFinite(maxI)) return;
    const span = Math.max(0.01, maxI - minI);
    minI = Math.max(0, minI - span * 0.12);
    maxI += span * 0.12;
    const X = (a: number) => L + (a / 360) * (w - L - Rg);
    const Y = (v: number) => h - Bm - ((v - minI) / (maxI - minI || 1)) * (h - T - Bm);
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
    for (let a = 0; a <= 360; a += 60) ctx.fillText(`${a}°`, X(a), h - 7);
    if (data.factor > 1) {
      ctx.strokeStyle = "rgba(76,201,240,0.85)";
      ctx.lineWidth = 1;
      for (let i = 0; i < data.length; i++) {
        const phase = ((data.angles[i] % 360) + 360) % 360;
        const x = X(phase);
        const y = Y(data.amps[i]);
        const y0 = Y(data.amps[i] - data.ampsErr[i]);
        const y1 = Y(data.amps[i] + data.ampsErr[i]);
        const x0 = X(Math.max(0, phase - data.angleErr[i]));
        const x1 = X(Math.min(360, phase + data.angleErr[i]));
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
    ctx.strokeStyle = "rgba(245,165,36,0.95)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    let started = false;
    let previousPhase: number | null = null;
    for (let i = 0; i < data.length; i++) {
      const phase = ((data.angles[i] % 360) + 360) % 360;
      const x = X(phase);
      const y = Y(data.amps[i]);
      if (!started || (previousPhase !== null && Math.abs(phase - previousPhase) > 180)) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      started = true;
      previousPhase = phase;
    }
    ctx.stroke();
  };

  /* ── dibujo: FFT ─────────────────────────────────────── */
  const drawFft = (ctx: CanvasRenderingContext2D, w: number, h: number) => {
    ctx.clearRect(0, 0, w, h);
    const mag = derived?.mag;
    ctx.font = "8.5px IBM Plex Mono, monospace";
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
    const X = (i: number) => L + (i / usable) * (w - L * 2);
    const Y = (v: number) => h - Bm - Math.sqrt(v / (mx || 1)) * (h - Bm - 12);
    ctx.fillStyle = "rgba(76,201,240,0.5)";
    const bw = Math.max(1, (w - L * 2) / usable - 0.5);
    for (let i = 2; i < usable; i++) {
      const y = Y(mag[i]);
      ctx.fillRect(X(i), y, bw, h - Bm - y);
    }
    ctx.fillStyle = "#42567a";
    ctx.textAlign = "left";
    ctx.fillText("0 Hz", L, h - 6);
    ctx.textAlign = "right";
    ctx.fillText(`${(usable * derived.df).toFixed(2)} Hz`, w - L, h - 6);
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
    const mag = derived?.mag;
    if (!mag || !derived) return;
    const center = Math.max(2, Math.min(mag.length - 2, Math.round(x * mag.length)));
    const radius = Math.max(8, Math.round(mag.length * 0.008));
    let bin = center;
    for (let i = Math.max(2, center - radius); i <= Math.min(mag.length - 2, center + radius); i++) {
      if (mag[i] > mag[bin]) bin = i;
    }
    const freq = bin * derived.df;
    const peak = { bin, freq, period: 1 / freq, mag: mag[bin] };
    setSelectedPeaks((current) =>
      current.some((item) => item.bin === bin) ? current : [...current, peak].sort((a, b) => a.freq - b.freq),
    );
  };

  const pickMountPosition = (kind: "polar" | "cartesiano", x: number, y: number, clientX: number, clientY: number) => {
    if (!derived?.plot?.length) return;
    const angle = kind === "polar"
      ? ((Math.atan2(x - 0.5, -(y - 0.5)) * 180) / Math.PI + 360) % 360
      : Math.min(360, Math.max(0, ((x - 0.04) / 0.95) * 360));
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
    let peaksCsv = "source,frequency_hz,period_s,period_mount_deg,magnitude\n";
    for (const [source, peak] of [
      ...derived.peaks.map((peak, index) => [`automatic_A${index + 1}`, peak] as const),
      ...selectedPeaks.map((peak, index) => [`manual_M${index + 1}`, peak] as const),
    ]) {
      peaksCsv += `${source},${peak.freq.toFixed(9)},${peak.period.toFixed(9)},${
        derived.st.feedbackSpeedDegS ? (peak.period * derived.st.feedbackSpeedDegS).toFixed(9) : ""
      },${peak.mag.toExponential(9)}\n`;
    }
    await flip.exportBundle([
      { name: "graficas/corriente-tiempo.png", data: live },
      { name: "graficas/polar-elipse.png", data: polar },
      { name: "graficas/cartesiana.png", data: cart },
      { name: "graficas/fft.png", data: fft },
      { name: "datos/fft-picos.csv", data: peaksCsv },
    ]);
  };

  const chartFor = useMemo(() => {
    const interaction = {
      zoomMode,
      transform: transforms[view],
      onTransform: setTransform,
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
  }, [view, derived, n, flip.tick, flip.overlayRevs, flip.capturing, zoomMode, transforms, selectedPeaks]);

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
        {VIEWS.map((v) => (
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
            bloque ×
            <select value={flip.avgFactor} onChange={(e) => flip.setAvgFactor(Number(e.target.value))} className={selCls}>
              {AVGS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <label className="hidden cursor-pointer items-center gap-1.5 font-mono text-[10px] text-dim md:flex">
            <input
              type="checkbox"
              checked={flip.overlayRevs}
              onChange={(e) => flip.setOverlayRevs(e.target.checked)}
              className="accent-[#f5a524]"
            />
            superponer revs
          </label>
          {view !== "stats" && (
            <>
              <button
                onClick={() => setZoomMode((active) => !active)}
                className={`rounded border px-2 py-1 font-display text-[9px] font-bold tracking-wider ${
                  zoomMode ? "border-ion/60 bg-ion/15 text-ion" : "border-line text-dim hover:text-fog"
                }`}
              >
                ZOOM / PAN
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
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px">
          <span className="text-dim">I </span>
          <span className="tabular-nums text-ember">{stats.lastA.toFixed(3)} A</span>
        </span>
        <span className="rounded border border-line bg-[#0c1930] px-1.5 py-px" title="Valor eficaz de las últimas 50 muestras">
          <span className="text-dim">I RMS₅₀ </span>
          <span className="tabular-nums text-ion">{stats.rms50.toFixed(3)} A</span>
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
        <span className="ml-auto hidden text-[9px] text-[#3c5178] lg:inline">
          K={ADC_CAL_K} · R={SHUNT_R_OHM} Ω · I=ADC×{AMP_PER_RAW.toFixed(6)} · 0–{MAX_CURRENT_A} A
        </span>
      </div>

      {flip.notice && (
        <div className="mx-3 mt-2 flex shrink-0 items-start gap-2 rounded border border-ember/40 bg-ember/5 px-3 py-2 font-mono text-[10.5px] text-[#ffd9a0]">
          <IconAlert className="mt-px h-3.5 w-3.5 shrink-0 text-ember" /> {flip.notice}
        </div>
      )}

      {/* zona de gráfico / estadísticas */}
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {view !== "stats" ? (
          <div className="flex min-h-[300px] flex-col gap-2">
            {chartFor}
            {zoomMode && (
              <p className="font-mono text-[9.5px] text-ion">Modo zoom: rueda para ampliar/reducir · arrastra para desplazar · Restaurar vuelve al encuadre completo.</p>
            )}
            {(view === "polar" || view === "cartesiano") && derived?.plot && (
              <p className="font-mono text-[9.5px] text-dim">
                ×1 representa cada muestra con ángulo · ×N representa la media de bloques consecutivos de N
                {view === "cartesiano" && flip.avgFactor > 1 ? " · barras X/Y = error estándar (SEM)" : ""}
              </p>
            )}
            {view === "fft" && derived && (
              <div className="overflow-hidden rounded border border-line">
                <p className="border-b border-line bg-[#0c1930] px-2 py-1.5 font-mono text-[9px] text-dim">
                  5 picos principales automáticos + selecciones manuales · pulsa sobre el espectro para añadir
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
                    {derived.peaks.map((p, i) => (
                      <tr key={`auto-${p.bin}`} className="border-t border-line/60 text-fog">
                        <td className="px-2 py-1 text-ember">A{i + 1}</td>
                        <td className="px-2 py-1 tabular-nums">{p.freq.toFixed(3)} Hz</td>
                        <td className="px-2 py-1 tabular-nums">
                          {p.period >= 1 ? `${p.period.toFixed(3)} s` : `${(p.period * 1000).toFixed(1)} ms`}
                        </td>
                        <td className="px-2 py-1 tabular-nums text-ion">
                          {derived.st.feedbackSpeedDegS
                            ? `${(p.period * derived.st.feedbackSpeedDegS).toFixed(3)}°`
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
                          {derived.st.feedbackSpeedDegS
                            ? `${(p.period * derived.st.feedbackSpeedDegS).toFixed(3)}°`
                            : "—"}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums text-dim">
                          {p.mag.toExponential(2)}
                        </td>
                        <td className="px-2 py-1 text-right">
                          <button
                            title="Quitar pico"
                            aria-label={`Quitar pico ${p.freq.toFixed(3)} Hz`}
                            onClick={() => setSelectedPeaks((items) => items.filter((item) => item.bin !== p.bin))}
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
                Espectro · {derived.st.durS.toFixed(1)} s de señal · resolución{" "}
                {(1 / (derived.st.durS || 1)).toFixed(3)} Hz · ventana de Hann · grados calculados con velocidad medida :j
              </p>
            )}
          </div>
        ) : !derived ? (
          <p className="rounded border border-dashed border-line px-3 py-10 text-center font-mono text-[10.5px] text-dim">
            Sin datos todavía: captura, importa un CSV o carga una sesión.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-1.5 font-mono text-[10px] sm:grid-cols-2">
            <StatCell k="N (crudo / promediado)" v={`${derived.st.n.toLocaleString("es-ES")} / ${derived.st.nAvg.toLocaleString("es-ES")}`} />
            <StatCell k="tiempo real adquisición" v={`${derived.st.durS.toFixed(2)} s`} />
            <StatCell k="tasa ADC efectiva" v={`${derived.st.rateEst.toFixed(1)} Hz`} />
            <StatCell
              k="rendimiento solicitado/efectivo"
              v={`${Math.min(999, (derived.st.rateEst / flip.rate) * 100).toFixed(1)} %`}
              tone={derived.st.rateEst < flip.rate * 0.9 ? "text-alert" : "text-mint"}
            />
            {derived.st.feedbackSpeedDegS !== null && (
              <StatCell k="velocidad medida (:j)" v={`${derived.st.feedbackSpeedDegS.toFixed(4)} °/s`} tone="text-ion" />
            )}
            {derived.st.samplesPerDeg !== null && (
              <StatCell k="muestras / grado medidas" v={derived.st.samplesPerDeg.toFixed(1)} tone="text-ion" />
            )}
            <StatCell k="recorrido confirmado :j" v={`${derived.st.angleSpanDeg.toFixed(2)}°`} tone={derived.st.angleSpanDeg >= 358 ? "text-mint" : "text-alert"} />
            <StatCell k="factor de promedio" v={`×${flip.avgFactor}`} tone="text-ion" />
            <StatCell k="media" v={`${derived.st.mean.toFixed(5)} A`} />
            <StatCell k="mediana" v={`${derived.st.median.toFixed(5)} A`} />
            <StatCell k="desv. típica σ" v={`${derived.st.sd.toFixed(5)} A`} />
            <StatCell k="σ de la media (σ/√N)" v={`${derived.st.sem.toExponential(2)} A`} tone="text-mint" />
            <StatCell k="pico máximo" v={`${derived.st.maxA.toFixed(3)} A`} tone="text-ember" />
            {derived.st.circ && (
              <>
                <StatCell k="ángulo medio (circ.)" v={`${derived.st.circ.meanDeg.toFixed(2)}°`} tone="text-ion" />
                <StatCell
                  k="R̄ / σ circular"
                  v={`${derived.st.circ.R.toFixed(3)} / ${derived.st.circ.stdDeg.toFixed(2)}°`}
                  tone="text-ion"
                />
              </>
            )}
            {derived.st.dThetaEnc !== null && (
              <StatCell k="δθ encoder (360/CPR)" v={`${derived.st.dThetaEnc.toExponential(2)}°`} tone="text-ion" />
            )}
            {flip.deviceInfo && (
              <StatCell
                k={`Flipper ${flip.deviceInfo.version} · OOR / OVF`}
                v={`${flip.deviceInfo.outOfRange} / ${flip.deviceInfo.overflow}`}
                tone={flip.deviceInfo.overflow ? "text-alert" : "text-mint"}
              />
            )}
            {!flip.capturing && derived.ellipse && (
              <>
                <StatCell k="elipse · semiejes a / b" v={`${derived.ellipse.semiMajor.toFixed(4)} / ${derived.ellipse.semiMinor.toFixed(4)} A`} tone="text-ion" />
                <StatCell k="elipse · inclinación φ" v={`${derived.ellipse.angleDeg.toFixed(2)}°`} tone="text-ion" />
                <StatCell k="elipse · centro x / y" v={`${derived.ellipse.centerX.toFixed(4)} / ${derived.ellipse.centerY.toFixed(4)} A`} tone="text-ion" />
                <StatCell k="elipse · excentricidad / RMS" v={`${derived.ellipse.eccentricity.toFixed(4)} / ${derived.ellipse.rms.toFixed(4)}`} tone="text-ion" />
              </>
            )}
          </div>
        )}

        {/* datos */}
        <div className="mt-3 border-t border-line pt-2.5">
          <p className="mb-1.5 font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-[#4d6389]">
            Datos · crudo inmutable
          </p>
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
            <button
              onClick={() => void exportAll()}
              disabled={!derived}
              className="flex items-center justify-center gap-1.5 rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.1em] text-fog transition-colors hover:border-ember/50 hover:text-ember"
            >
              <IconDownload className="h-3 w-3" /> EXPORTAR TODO (.ZIP)
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              className="flex items-center justify-center gap-1.5 rounded border border-line px-2 py-1.5 font-display text-[9.5px] font-bold tracking-[0.1em] text-fog transition-colors hover:border-ion/50 hover:text-ion"
            >
              <IconDownload className="h-3 w-3 rotate-180" /> IMPORTAR
            </button>
            <button
              onClick={() => void flip.saveSession()}
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
                      {s.adc.length.toLocaleString("es-ES")} mues. · {s.rateHz} Hz
                    </p>
                  </div>
                  <button
                    onClick={() => flip.loadSession(s)}
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
