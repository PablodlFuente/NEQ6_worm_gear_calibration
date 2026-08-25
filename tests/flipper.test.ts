import assert from "node:assert/strict";
import test from "node:test";
import {
  AMP_PER_RAW,
  StreamParser,
  adcToAmps,
  chooseSampleClockOffset,
  averageAngleSeries,
  angleAt,
  buildProcCsv,
  buildRawCsv,
  capturedAngleDeltaDeg,
  classifyExtendedPeaks,
  circularStats,
  fitPolarEllipse,
  parseCsv,
  unwrapDegrees,
} from "../src/lib/flipper.ts";
import { calculateMotionTiming, lowSpeedGotoMarginSteps, MAX_GOTO_STEPS, MAX_POSITION_DELTA, MAX_SAFE_ABSOLUTE_GOTO_DELTA, MIN_T1_TICKS, NEQ6_MAX_SLEW_RATE, requiresDangerConfirmation, SIDEREAL_DEG_PER_SEC } from "../src/lib/protocol.ts";
import { buildZip } from "../src/lib/zip.ts";

function frame(timestamp: number, adc: number): Uint8Array {
  return Uint8Array.from([
    0xa5,
    0x5a,
    timestamp & 0xff,
    (timestamp >>> 8) & 0xff,
    (timestamp >>> 16) & 0xff,
    (timestamp >>> 24) & 0xff,
    adc & 0xff,
    (adc >>> 8) & 0xff,
  ]);
}

test("separa respuestas ASCII de tramas binarias partidas", () => {
  const parser = new StreamParser();
  const packet = Uint8Array.from([79, 75, 10, ...frame(0x0d0a4f4b, 0x0a0d), 83, 89]);
  const first = parser.feed(packet.slice(0, 7), 1000);
  const second = parser.feed(packet.slice(7), 1001);
  const third = parser.feed(Uint8Array.from([78, 67, 32, 49, 50, 51, 10]), 1002);

  assert.deepEqual(first.lines, ["OK"]);
  assert.equal(second.samples[0]?.adc, 0x0a0d);
  assert.deepEqual(third.lines, ["SYNC 123"]);
});

test("desenvuelve el timestamp u32 al cruzar 71,6 minutos", () => {
  const parser = new StreamParser();
  const a = parser.feed(frame(0xffffff00, 10), 0).samples[0];
  const b = parser.feed(frame(0x00000100, 11), 0).samples[0];
  assert.equal(b.ts - a.ts, 0x200);
});

test("aplica la calibración exacta del shunt", () => {
  assert.equal(AMP_PER_RAW, (2.5 * 1.0025189) / 4096 / 0.323);
  assert.ok(Math.abs(adcToAmps(1320) - 2.5005989155) < 1e-9);
  assert.equal(adcToAmps(4096, { shuntOhm: 0.5, k: 1 }), 5);
});

test("desenvuelve e interpola ángulos a través de 0 grados", () => {
  const points = unwrapDegrees([
    { tb: 0, deg: 350 },
    { tb: 100, deg: 10 },
    { tb: 200, deg: 30 },
  ]);
  assert.deepEqual(points.map((point) => point.deg), [350, 370, 390]);
  assert.equal(angleAt(points, 50), 360);
});

test("fija el reloj ADC a la vuelta u32 correcta al comenzar", () => {
  const receivedAt = 1_700_000_000_000;
  const sampleUs = 12_000_000;
  const correct = sampleUs / 1000 - receivedAt;
  assert.equal(chooseSampleClockOffset(correct, sampleUs, receivedAt), correct);
  assert.equal(chooseSampleClockOffset(correct + 0x100000000 / 1000, sampleUs, receivedAt), correct);
});

test("CSV crudo conserva timestamp, ADC y tiempo sincronizado", () => {
  const samples = [
    { ts: 100, adc: 321, tb: 1_700_000_000_000 },
    { ts: 200, adc: 654, tb: 1_700_000_000_001 },
  ];
  const parsed = parseCsv(buildRawCsv(samples, 100));
  assert.deepEqual(parsed?.samples, samples);
  assert.deepEqual(parsed?.angles, []);
  assert.equal(parsed?.processed, false);
});

test("CSV conserva eje, sentido y origen absoluto de la captura", () => {
  const csv = buildRawCsv(
    [{ ts: 100, adc: 321, tb: 1_700_000_000_000 }],
    500,
    { axis: 2, direction: "ccw", originSteps: 123456 },
    { shuntOhm: 0.5, k: 0.99 },
  );
  const parsed = parseCsv(csv)!;
  assert.deepEqual(parsed.metadata, { axis: 2, direction: "ccw", originSteps: 123456 });
  assert.deepEqual(parsed.calibration, { shuntOhm: 0.5, k: 0.99 });
});

test("reposiciona un ángulo relativo respetando origen y sentido", () => {
  const cpr = 360_000;
  assert.equal(capturedAngleDeltaDeg(110_000, cpr, { axis: 1, direction: "cw", originSteps: 100_000 }, 20), 10);
  assert.equal(capturedAngleDeltaDeg(90_000, cpr, { axis: 1, direction: "ccw", originSteps: 100_000 }, 20), -10);
});

test("el test extendido separa periodicidad angular de frecuencia fija", () => {
  const groups = classifyExtendedPeaks([
    { id: "f-cw", label: "f CW", direction: "cw", requestedSpeedDegS: 2, measuredSpeedDegS: 2, peaks: [
      { frequencyHz: 2, periodMountDeg: 1, magnitude: 10 },
      { frequencyHz: 7, periodMountDeg: 2 / 7, magnitude: 5 },
    ] },
    { id: "s-ccw", label: "s CCW", direction: "ccw", requestedSpeedDegS: 1, measuredSpeedDegS: 1, peaks: [
      { frequencyHz: 1, periodMountDeg: 1, magnitude: 9 },
      { frequencyHz: 7.01, periodMountDeg: 1 / 7.01, magnitude: 4 },
    ] },
  ]);
  assert.equal(groups.find((group) => Math.abs((group.representativeDeg ?? 0) - 1) < 0.01)?.classification, "mecánica");
  assert.equal(groups.find((group) => Math.abs(group.representativeHz - 7) < 0.1)?.classification, "eléctrica/muestreo");
});

test("un pico presente con motores parados se clasifica como eléctrico", () => {
  const groups = classifyExtendedPeaks([
    { id: "noise", label: "motores parados", direction: "stationary", requestedSpeedDegS: 0, measuredSpeedDegS: null, peaks: [
      { frequencyHz: 50, periodMountDeg: null, magnitude: 4 },
    ] },
    { id: "fast", label: "rápida CW", direction: "cw", requestedSpeedDegS: 3, measuredSpeedDegS: 3, peaks: [
      { frequencyHz: 49.9, periodMountDeg: 3 / 49.9, magnitude: 8 },
    ] },
  ]);
  assert.equal(groups[0].classification, "eléctrica/muestreo");
  assert.match(groups[0].reason, /motores parados/i);
});

test("la estadística circular ponderada apunta hacia la carga dominante", () => {
  const circular = circularStats([0, 90, 180, 270], [10, 1, 1, 1]);
  assert.ok(circular.R > 0.6);
  assert.ok(circular.meanDeg < 1 || circular.meanDeg > 359);
});

test("promedio por bloques conserva x1 y calcula SEM en ambos ejes", () => {
  const common = [0, 1, 2, 3];
  const x1 = averageAngleSeries(common, common, [10, 20, 30, 40], [1, 3, 5, 7], [0, 2, 4, 6], 1);
  assert.deepEqual(Array.from(x1!.amps), [1, 3, 5, 7]);
  assert.deepEqual(Array.from(x1!.angles), [0, 2, 4, 6]);

  const x2 = averageAngleSeries(common, common, [10, 20, 30, 40], [1, 3, 5, 7], [0, 2, 4, 6], 2);
  assert.deepEqual(Array.from(x2!.amps), [2, 6]);
  assert.deepEqual(Array.from(x2!.angles), [1, 5]);
  assert.deepEqual(Array.from(x2!.ampsErr), [1, 1]);
  assert.deepEqual(Array.from(x2!.angleErr), [1, 1]);
  assert.deepEqual(Array.from(x2!.counts), [2, 2]);
});

test("CSV procesado incluye errores X/Y y tamaño de bloque", () => {
  const csv = buildProcCsv(
    [{ ts: 10, tb: 20, adc: 30.5, amps: 0.2, ampsErr: 0.01, unw: 45, angleErr: 0.2, rev: 0, n: 50 }],
    100,
    [],
  );
  assert.match(csv, /amps_sem,angle_unwrapped_deg,angle_sem_deg,rev,tb_ms,n_group/);
  assert.match(csv, /0\.010000,45\.000000,0\.200000,0,20\.000,50/);
  const imported = parseCsv(csv);
  assert.deepEqual(imported?.angles, [{ tb: 20, deg: 45 }]);
});

test("una vuelta EQ6 se divide para evitar la ambigüedad modular de :S", () => {
  assert.equal(Math.ceil(9_020_208 / MAX_SAFE_ABSOLUTE_GOTO_DELTA), 2);
  assert.equal(MAX_POSITION_DELTA, 0x7fffff);
});

test("una vuelta EQ6 cabe en un único desplazamiento relativo :H", () => {
  assert.equal(Math.ceil(9_020_208 / MAX_GOTO_STEPS), 1);
});

test("el umbral posicional de INDI separa un GOTO corto de una vuelta", () => {
  const cpr = 9_020_208;
  const margin = lowSpeedGotoMarginSteps(cpr);
  assert.ok((2 * cpr) / 360 < margin);
  assert.ok(cpr > margin);
});

test("sólo las escrituras persistentes de riesgo piden confirmación", () => {
  assert.equal(requiresDangerConfirmation(":Q55AA"), true);
  assert.equal(requiresDangerConfirmation(" :E1800000"), true);
  assert.equal(requiresDangerConfirmation(":W1ABCD"), true);
  assert.equal(requiresDangerConfirmation(":L1"), false);
  assert.equal(requiresDangerConfirmation(":L2"), false);
  assert.equal(requiresDangerConfirmation(":j1"), false);
});

test("la velocidad respeta la cuantización y el mínimo T1=6", () => {
  const timer = 64_935;
  const cpr = 9_020_208;
  const fast = calculateMotionTiming(timer, cpr, 5);
  assert.equal(fast.t1, MIN_T1_TICKS);
  assert.equal(fast.limited, true);
  assert.ok(Math.abs(fast.realDegPerSec - fast.maxDegPerSec) < 1e-12);

  const normal = calculateMotionTiming(timer, cpr, 0.2);
  assert.ok(normal.t1 > MIN_T1_TICKS);
  assert.equal(normal.limited, false);
  assert.ok(Math.abs(normal.realDegPerSec - 0.2) < 0.01);
});

test("T1=13 permanece en modo lento a unos 0,199 grados por segundo", () => {
  const timing = calculateMotionTiming(64_935, 9_024_000, 0.199, 16);
  assert.equal(timing.highSpeed, false);
  assert.equal(timing.stepMultiplier, 1);
  assert.equal(timing.t1, 13);
  assert.ok(Math.abs(timing.realDegPerSec - 0.199) < 0.002);
});

test("800x usa el ratio rápido y respeta el límite nominal de la NEQ6", () => {
  const requested = NEQ6_MAX_SLEW_RATE * SIDEREAL_DEG_PER_SEC;
  const timing = calculateMotionTiming(64_935, 9_024_000, requested, 16);
  assert.equal(timing.highSpeed, true);
  assert.equal(timing.stepMultiplier, 16);
  assert.equal(timing.t1, 13);
  assert.ok(timing.realDegPerSec <= requested);
  assert.ok(timing.maxDegPerSec <= 3.35);
});

test("ajusta los semiejes y la inclinación de una elipse polar", () => {
  const angles: number[] = [];
  const radii: number[] = [];
  for (let deg = 0; deg < 360; deg += 2) {
    const t = (deg * Math.PI) / 180;
    const x = 2 * Math.cos(t);
    const y = Math.sin(t);
    angles.push(((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360);
    radii.push(Math.hypot(x, y));
  }
  const fit = fitPolarEllipse(angles, radii)!;
  assert.ok(Math.abs(fit.semiMajor - 2) < 0.03);
  assert.ok(Math.abs(fit.semiMinor - 1) < 0.03);
  assert.ok(fit.rms < 0.03);
});

test("el ZIP de exportación admite CSV y PNG binario", async () => {
  const bytes = new Uint8Array(await buildZip([
    { name: "datos/test.csv", data: "a,b\n1,2\n" },
    { name: "graficas/test.png", data: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]) },
  ]).arrayBuffer());
  assert.deepEqual(Array.from(bytes.slice(0, 4)), [0x50, 0x4b, 0x03, 0x04]);
  assert.ok(bytes.length > 100);
});
