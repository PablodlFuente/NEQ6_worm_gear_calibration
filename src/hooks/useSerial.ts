import { useCallback, useEffect, useRef, useState } from "react";

export interface SerialSettings {
  baudRate: number;
  dataBits: 7 | 8;
  stopBits: 1 | 2;
  parity: "none" | "even" | "odd";
}

export type SerialStatus = "closed" | "connecting" | "open";

interface Callbacks {
  onData: (chunk: Uint8Array) => void;
  onDisconnect: () => void;
}

export function useSerial(cb: Callbacks) {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const [status, setStatus] = useState<SerialStatus>("closed");
  const [portInfo, setPortInfo] = useState<SerialPortInfo | undefined>(undefined);
  const [authorized, setAuthorized] = useState<SerialPort[]>([]);

  const cbRef = useRef(cb);
  cbRef.current = cb;
  const portRef = useRef<SerialPort | null>(null);
  const keepReadingRef = useRef(false);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);

  const refresh = useCallback(async () => {
    if (!navigator.serial) return;
    try {
      setAuthorized(await navigator.serial.getPorts());
    } catch {
      /* sin permiso todavía */
    }
  }, []);

  useEffect(() => {
    if (!navigator.serial) return;
    void refresh();
    const onConnect = () => void refresh();
    const onDisconnect = (e: Event) => {
      void refresh();
      const port = (e as unknown as { target?: SerialPort }).target;
      if (port && port === portRef.current) {
        keepReadingRef.current = false;
        try {
          void readerRef.current?.cancel();
        } catch {
          /* ya cerrado */
        }
        portRef.current = null;
        writerRef.current = null;
        readerRef.current = null;
        setStatus("closed");
        setPortInfo(undefined);
        cbRef.current.onDisconnect();
      }
    };
    navigator.serial.addEventListener("connect", onConnect);
    navigator.serial.addEventListener("disconnect", onDisconnect);
    return () => {
      navigator.serial?.removeEventListener("connect", onConnect);
      navigator.serial?.removeEventListener("disconnect", onDisconnect);
    };
  }, [refresh]);

  const pump = useCallback(async (port: SerialPort) => {
    while (keepReadingRef.current && port.readable) {
      const reader = port.readable.getReader();
      readerRef.current = reader;
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) cbRef.current.onData(value);
        }
      } catch {
        /* error de lectura: se reintenta si sigue abierto */
      } finally {
        try {
          reader.releaseLock();
        } catch {
          /* nada */
        }
        readerRef.current = null;
      }
      if (!keepReadingRef.current) break;
      await new Promise((r) => setTimeout(r, 100));
    }
  }, []);

  const openPort = useCallback(
    async (port: SerialPort, settings: SerialSettings) => {
      setStatus("connecting");
      try {
        await port.open({
          baudRate: settings.baudRate,
          dataBits: settings.dataBits,
          stopBits: settings.stopBits,
          parity: settings.parity,
          flowControl: "none",
          bufferSize: 4096,
        });
        portRef.current = port;
        setPortInfo(port.getInfo());
        keepReadingRef.current = true;
        writerRef.current = port.writable!.getWriter();
        setStatus("open");
        void pump(port);
        void refresh();
      } catch (e) {
        setStatus("closed");
        throw e;
      }
    },
    [pump, refresh],
  );

  const requestAndOpen = useCallback(
    async (settings: SerialSettings) => {
      if (!navigator.serial) throw new Error("Web Serial no disponible");
      const port = await navigator.serial.requestPort({});
      await openPort(port, settings);
    },
    [openPort],
  );

  const openAuthorized = useCallback(
    async (port: SerialPort, settings: SerialSettings) => {
      await openPort(port, settings);
    },
    [openPort],
  );

  const write = useCallback(async (bytes: Uint8Array) => {
    const w = writerRef.current;
    if (!w) throw new Error("Puerto no abierto");
    await w.write(bytes);
  }, []);

  const close = useCallback(async () => {
    keepReadingRef.current = false;
    const port = portRef.current;
    try {
      void readerRef.current?.cancel();
    } catch {
      /* nada */
    }
    try {
      await writerRef.current?.close();
    } catch {
      /* nada */
    }
    try {
      writerRef.current?.releaseLock();
    } catch {
      /* nada */
    }
    writerRef.current = null;
    readerRef.current = null;
    if (port) {
      try {
        await port.close();
      } catch {
        /* ya cerrado */
      }
    }
    portRef.current = null;
    setStatus("closed");
    setPortInfo(undefined);
    void refresh();
  }, [refresh]);

  useEffect(
    () => () => {
      keepReadingRef.current = false;
    },
    [],
  );

  return { supported, status, portInfo, authorized, requestAndOpen, openAuthorized, close, write };
}
