import assert from "node:assert/strict";
import test from "node:test";
import {
  AMP_PER_RAW,
  StreamParser,
  adcToAmps,
  angleAt,
  buildRawCsv,
  parseCsv,
  unwrapDegrees,
} from "../src/lib/flipper.ts";

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
  assert.equal(parsed?.processed, false);
});
