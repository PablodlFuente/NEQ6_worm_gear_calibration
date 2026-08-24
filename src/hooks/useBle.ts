import { useCallback, useEffect, useRef, useState } from "react";
import { StreamParser, type Sample } from "../lib/flipper";

export type BleState = "idle" | "scanning" | "connecting" | "connected";

/* Perfil Bluetooth Serial del firmware de Flipper (oficial y Momentum).
 * Nombres desde el punto de vista del Flipper: RX recibe del PC y TX notifica. */
export const FLIPPER_SERIAL_SERVICE = "8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000";
export const FLIPPER_RX_CHAR = "19ed82ae-ed21-4c9d-4145-228e62fe0000"; /* PC -> Flipper */
export const FLIPPER_TX_CHAR = "19ed82ae-ed21-4c9d-4145-228e61fe0000"; /* Flipper -> PC */
/* Nordic UART Service (dispositivos compatibles) */
const NUS_SERVICE = "6e400001-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_RX = "6e400002-b5a3-f393-e0a9-e50e24dcca9e";
const NUS_TX = "6e400003-b5a3-f393-e0a9-e50e24dcca9e";

interface Callbacks {
  onSamples: (s: Sample[]) => void;
  onLine: (line: string) => void;
  onDrop: () => void;
}

export function useBle(cb: Callbacks) {
  const supported = typeof navigator !== "undefined" && "bluetooth" in navigator;

  const [state, setState] = useState<BleState>("idle");
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cbRef = useRef(cb);
  cbRef.current = cb;

  const parserRef = useRef(new StreamParser());
  const rxRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null); /* write */
  const txRef = useRef<BluetoothRemoteGATTCharacteristic | null>(null); /* notify */
  const deviceRef = useRef<BluetoothDevice | null>(null);

  const handleNotify = useCallback((e: Event) => {
    const ch = e.target as BluetoothRemoteGATTCharacteristic;
    if (!ch.value) return;
    const bytes = new Uint8Array(ch.value.buffer, ch.value.byteOffset, ch.value.byteLength);
    const { samples, lines } = parserRef.current.feed(bytes, Date.now());
    if (samples.length) cbRef.current.onSamples(samples);
    lines.forEach((l) => cbRef.current.onLine(l));
  }, []);

  /*
   * IMPORTANTE: requestDevice() debe ejecutarse DENTRO del gesto del usuario
   * y SIN ningún await previo — cualquier await antes rompería el transitorio
   * user activation y Chrome rechazaría el permiso ("Must be handling a user
   * gesture"). Por eso la selección es una única llamada síncrona al handler.
   */
  const scanAndConnect = useCallback(async () => {
    if (!navigator.bluetooth) throw new Error("Web Bluetooth no disponible");
    setError(null);
    setState("scanning");
    parserRef.current.reset();
    let device: BluetoothDevice;
    try {
      device = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true, /* el Flipper a veces no anuncia el servicio */
        optionalServices: [FLIPPER_SERIAL_SERVICE, NUS_SERVICE],
      });
    } catch (e) {
      setState(deviceRef.current ? "connected" : "idle");
      if ((e as Error).name === "NotFoundError") return; /* usuario canceló */
      throw e;
    }
    setState("connecting");
    deviceRef.current = device;
    setDeviceName(device.name ?? "Flipper (sin nombre)");
    device.addEventListener("gattserverdisconnected", () => {
      txRef.current = null;
      rxRef.current = null;
      setState("idle");
      cbRef.current.onDrop();
    });
    try {
      if (!device.gatt) throw new Error("El dispositivo seleccionado no expone GATT");
      const server = await device.gatt.connect();
      const services = await server.getPrimaryServices();

      /* descubrimiento: buscar un servicio con notify + write
       * (prefiriendo el perfil serie de Flipper y NUS) */
      let tx: BluetoothRemoteGATTCharacteristic | null = null;
      let rx: BluetoothRemoteGATTCharacteristic | null = null;
      const rank = (uuid: string) =>
        uuid === FLIPPER_SERIAL_SERVICE || uuid === NUS_SERVICE ? 0 : 1;
      const sorted = [...services].sort((a, b) => rank(a.uuid) - rank(b.uuid));
      for (const svc of sorted) {
        let chars: BluetoothRemoteGATTCharacteristic[];
        try {
          chars = await svc.getCharacteristics();
        } catch {
          continue;
        }
        const n =
          chars.find((c) => c.uuid === FLIPPER_TX_CHAR || c.uuid === NUS_TX) ??
          chars.find((c) => c.properties.notify);
        const w =
          chars.find((c) => c.uuid === FLIPPER_RX_CHAR || c.uuid === NUS_RX) ??
          chars.find((c) => c.properties.write || c.properties.writeWithoutResponse);
        if (n && w) {
          tx = n;
          rx = w;
          break;
        }
      }
      if (!tx || !rx)
        throw new Error(
          "Ningún servicio serie BLE encontrado en el dispositivo (se esperaba el perfil Bluetooth Serial del Flipper o NUS).",
        );
      txRef.current = tx;
      rxRef.current = rx;
      tx.addEventListener("characteristicvaluechanged", handleNotify);
      await tx.startNotifications();
      setState("connected");
    } catch (e) {
      try {
        device.gatt?.disconnect();
      } catch {
        /* ya desconectado */
      }
      txRef.current = null;
      rxRef.current = null;
      setState("idle");
      throw e;
    }
  }, [handleNotify]);

  const disconnect = useCallback(() => {
    try {
      deviceRef.current?.gatt?.disconnect();
    } catch {
      /* ya desconectado */
    }
    txRef.current = null;
    rxRef.current = null;
    setState("idle");
  }, []);

  const sendText = useCallback(async (text: string) => {
    const ch = rxRef.current;
    if (!ch) throw new Error("BLE no conectado");
    const bytes = new TextEncoder().encode(text.endsWith("\n") ? text : text + "\n");
    /* Con respuesta se detectan errores de autenticación; algunos firmwares
     * solo exponen writeWithoutResponse, por lo que se mantiene el fallback. */
    if (ch.properties.write) await ch.writeValue(bytes);
    else if (ch.properties.writeWithoutResponse) await ch.writeValueWithoutResponse(bytes);
    else throw new Error("La característica BLE no admite escritura");
  }, []);

  useEffect(
    () => () => {
      try {
        deviceRef.current?.gatt?.disconnect();
      } catch {
        /* nada */
      }
    },
    [],
  );

  return { supported, state, deviceName, error, setError, scanAndConnect, disconnect, sendText };
}
