import type { Decoded, MotionTiming, MountProfile, QuickGroup } from "../lib/protocol";

export interface MountDriver {
  id: string;
  manufacturer: string;
  model: string;
  protocolName: string;
  serial: {
    baudRate: number;
    dataBits: 7 | 8;
    stopBits: 1 | 2;
    parity: "none" | "even" | "odd";
  };
  quickCommands: QuickGroup[];
  diagnosticSequence: string[];
  decodeResponse(commandKey: string | null, line: string): Decoded | null;
  requiresDangerConfirmation(command: string): boolean;
  calculateMotionTiming(timer: number, cpr: number, requestedDegPerSec: number, highSpeedRatio?: number): MotionTiming;
  emptyProfile(): MountProfile;
}
