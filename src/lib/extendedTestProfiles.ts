export type ExtendedTestMotionStep = {
  id: string;
  kind: "motion";
  name: string;
  axis: 1 | 2;
  direction: "cw" | "ccw";
  speedDegS: number;
  sampleRateHz: number;
  revolutions: number;
};

export type ExtendedTestStationaryStep = {
  id: string;
  kind: "stationary";
  name: string;
  axis: 1 | 2;
  sampleRateHz: number;
  durationSec: number;
};

export type ExtendedTestStep = ExtendedTestMotionStep | ExtendedTestStationaryStep;

export interface ExtendedTestProfile {
  id: string;
  name: string;
  steps: ExtendedTestStep[];
}

export const DEFAULT_EXTENDED_TEST_PROFILE: ExtendedTestProfile = {
  id: "comparativa-dos-velocidades",
  name: "Comparativa 2 velocidades · CW/CCW",
  steps: [
    { id: "noise", kind: "stationary", name: "Ruido con motores parados", axis: 1, sampleRateHz: 500, durationSec: 20 },
    { id: "fast-cw", kind: "motion", name: "Rápida CW", axis: 1, direction: "cw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 },
    { id: "fast-ccw", kind: "motion", name: "Rápida CCW", axis: 1, direction: "ccw", speedDegS: 3.34, sampleRateHz: 500, revolutions: 1 },
    { id: "slow-cw", kind: "motion", name: "Lenta CW", axis: 1, direction: "cw", speedDegS: 1.67, sampleRateHz: 250, revolutions: 1 },
    { id: "slow-ccw", kind: "motion", name: "Lenta CCW", axis: 1, direction: "ccw", speedDegS: 1.67, sampleRateHz: 250, revolutions: 1 },
  ],
};

const finiteRange = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

export const newExtendedStepId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `step-${Date.now()}-${Math.random().toString(16).slice(2)}`;

export const cloneExtendedProfile = (profile: ExtendedTestProfile): ExtendedTestProfile =>
  JSON.parse(JSON.stringify(profile)) as ExtendedTestProfile;

export function sanitizeExtendedProfile(value: unknown): ExtendedTestProfile | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ExtendedTestProfile>;
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || !Array.isArray(raw.steps)) return null;
  const steps = raw.steps.flatMap((candidate): ExtendedTestStep[] => {
    if (!candidate || typeof candidate !== "object") return [];
    const step = candidate as Partial<ExtendedTestStep>;
    const common = {
      id: typeof step.id === "string" && step.id ? step.id : newExtendedStepId(),
      name: typeof step.name === "string" && step.name.trim() ? step.name.trim() : "Paso",
      axis: step.axis === 2 ? 2 as const : 1 as const,
      sampleRateHz: Math.round(finiteRange(step.sampleRateHz, 500, 10, 1000)),
    };
    if (step.kind === "stationary") {
      return [{ ...common, kind: "stationary", durationSec: finiteRange(step.durationSec, 20, 1, 3600) }];
    }
    if (step.kind === "motion") {
      return [{
        ...common,
        kind: "motion",
        direction: step.direction === "ccw" ? "ccw" : "cw",
        speedDegS: finiteRange(step.speedDegS, 1, 0.01, 5),
        revolutions: Math.round(finiteRange(step.revolutions, 1, 1, 10)),
      }];
    }
    return [];
  });
  if (!steps.length) return null;
  return { id: raw.id, name: raw.name.trim() || "Perfil sin nombre", steps };
}

export function estimateExtendedProfileSeconds(profile: ExtendedTestProfile | undefined): number | null {
  if (!profile) return null;
  return profile.steps.reduce((total, step) => total + (step.kind === "stationary"
    ? step.durationSec
    : (step.revolutions * 360 + 4) / step.speedDegS), 0);
}
