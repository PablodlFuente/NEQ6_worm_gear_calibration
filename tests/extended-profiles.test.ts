import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_EXTENDED_TEST_PROFILE,
  estimateExtendedProfileSeconds,
  sanitizeExtendedProfile,
} from "../src/lib/extendedTestProfiles.ts";
import { classifyExtendedPeaks, type ExtendedPassResult } from "../src/lib/flipper.ts";

test("el perfil extendido inicial conserva las cinco fases históricas", () => {
  assert.equal(DEFAULT_EXTENDED_TEST_PROFILE.steps.length, 5);
  assert.equal(DEFAULT_EXTENDED_TEST_PROFILE.steps[0].kind, "stationary");
  assert.ok((estimateExtendedProfileSeconds(DEFAULT_EXTENDED_TEST_PROFILE) ?? 0) > 300);
});

test("la configuración importada queda limitada al rango ejecutable", () => {
  const profile = sanitizeExtendedProfile({
    id: "p",
    name: " ensayo ",
    steps: [{ id: "s", kind: "motion", name: "giro", axis: 7, direction: "x", speedDegS: 99, sampleRateHz: 9000, revolutions: 0 }],
  });
  assert.equal(profile?.name, "ensayo");
  assert.deepEqual(profile?.steps[0], { id: "s", kind: "motion", name: "giro", axis: 1, direction: "cw", speedDegS: 5, sampleRateHz: 1000, revolutions: 1 });
});

test("la clasificación agrupa bins compatibles por su resolución FFT", () => {
  const makePass = (id: string, frequencyHz: number): Pick<ExtendedPassResult, "id" | "label" | "direction" | "requestedSpeedDegS" | "measuredSpeedDegS" | "peaks"> => ({
    id,
    label: id,
    direction: id === "a" ? "cw" : "ccw",
    requestedSpeedDegS: id === "a" ? 1 : 2,
    measuredSpeedDegS: id === "a" ? 1 : 2,
    peaks: [{ frequencyHz, uncertaintyHz: 0.3, periodMountDeg: id === "a" ? 2 : 4, magnitude: 1 }],
  });
  const groups = classifyExtendedPeaks([makePass("a", 10), makePass("b", 10.55)]);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].passes.length, 2);
});
