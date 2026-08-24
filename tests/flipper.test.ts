import assert from "node:assert/strict";
import test from "node:test";
import {
  AMP_PER_RAW,
  StreamParser,
  adcToAmps,
  averageAngleSeries,
  angleAt,
  buildProcCsv,
  buildRawCsv,
  parseCsv,
  unwrapDegrees,
} from "../src/lib/flipper.ts";
import { MAX_GOTO_STEPS, MAX_POSITION_DELTA } from "../src/lib/protocol.ts";

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

test("una vuelta EQ6 cabe en un único GOTO de 24 bits", () => {
  assert.equal(Math.ceil(9_020_208 / MAX_GOTO_STEPS), 1);
  assert.equal(MAX_POSITION_DELTA, 0x7fffff);
});
