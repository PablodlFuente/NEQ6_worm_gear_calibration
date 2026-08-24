import { useCallback, useRef, useState } from "react";
import { StreamParser, type Sample } from "../lib/flipper";
import { useSerial } from "./useSerial";

interface Callbacks {
  onSamples: (samples: Sample[]) => void;
  onLine: (line: string) => void;
  onDrop: () => void;
}

export type FlipperUsbState = "idle" | "connecting" | "connected";

const SETTINGS = {
  baudRate: 115200,
  dataBits: 8 as const,
  stopBits: 1 as const,
  parity: "none" as const,
};

/** Segundo transporte del logger. El FAP expone CDC1 del USB dual como un
 * puerto COM independiente y conserva CDC0 para qFlipper/CLI. */
export function useFlipperSerial(cb: Callbacks) {
  const parserRef = useRef(new StreamParser());
  const cbRef = useRef(cb);
  cbRef.current = cb;
  const [error, setError] = useState<string | null>(null);

  const serial = useSerial({
    onData: (bytes) => {
      const { samples, lines } = parserRef.current.feed(bytes, Date.now());
      if (samples.length) cbRef.current.onSamples(samples);
      lines.forEach((line) => cbRef.current.onLine(line));
    },
    onDisconnect: () => cbRef.current.onDrop(),
  });

  const connect = useCallback(async () => {
    parserRef.current.reset();
    setError(null);
    try {
      await serial.requestAndOpen(SETTINGS);
    } catch (cause) {
      const e = cause as Error;
      if (e.name !== "NotFoundError") setError(e.message || String(e));
      throw cause;
    }
  }, [serial]);

  const disconnect = useCallback(async () => {
    await serial.close();
  }, [serial]);

  const sendText = useCallback(
    async (text: string) => {
      const payload = new TextEncoder().encode(text.endsWith("\n") ? text : `${text}\n`);
      await serial.write(payload);
    },
    [serial],
  );

  const info = serial.portInfo;
  const deviceName = info
    ? `Flipper USB ${info.usbVendorId?.toString(16).padStart(4, "0") ?? "----"}:${
        info.usbProductId?.toString(16).padStart(4, "0") ?? "----"
      }`
    : null;
  const state: FlipperUsbState =
    serial.status === "open" ? "connected" : serial.status === "connecting" ? "connecting" : "idle";

  return {
    supported: serial.supported,
    state,
    deviceName,
    error,
    setError,
    connect,
    disconnect,
    sendText,
  };
}
