# Instalación y verificación

## Requisitos

- Node.js 20 o posterior y Git.
- Chrome o Edge de escritorio; Web Serial y Web Bluetooth requieren un
  contexto seguro (`localhost` o HTTPS).
- EQDirect/UART-USB compatible con el nivel eléctrico de la montura.
- Flipper Zero con `NEQ6 Current`, o un logger que implemente el protocolo.
- Shunt low-side dimensionado, masa común y protección frente a sobretensión.

## Instalación reproducible

```powershell
git clone https://github.com/PablodlFuente/NEQ6_worm_gear_calibration.git
cd NEQ6_worm_gear_calibration
npm ci
npm run check
npm run dev
```

`npm ci` respeta el bloqueo de dependencias. `npm run check` ejecuta TypeScript,
pruebas y build. La aplicación queda en `http://127.0.0.1:3000`. El servidor de
desarrollo puede escuchar en la LAN: no debe exponerse a Internet sin control
de acceso, HTTPS y una revisión del registro de IP/acciones.

## Puesta en servicio de la montura

1. Alimenta la NEQ6 y conecta exclusivamente el EQDirect elegido.
2. Cierra EQMOD, ASCOM, SynScan App, planetarios o terminales que retengan el COM.
3. Abre **Ajustes -> Conexión montura** y selecciona 9600, 8 bits, sin paridad,
   1 bit de parada.
4. Al abrir el puerto se ejecuta el diagnóstico automáticamente. Deben aparecer
   firmware, CPR de AR/DEC, frecuencia del timer y ratio de alta velocidad.
5. Verifica en el monitor una transacción coherente: consulta enviada, respuesta
   `=` y ausencia de timeouts repetidos.

No continúes si CPR o timer son cero: la conversión grados/pasos y el cálculo de
T1 serían inválidos.

## Puesta en servicio del logger

1. Ejecuta `NEQ6 Current` en el Flipper.
2. Prueba BLE; si el servicio no es estable, selecciona CDC1 por USB-COM.
3. Ejecuta `INFO` y comprueba versión, tasa, estado, `OOR` y `OVF`.
4. Ejecuta `SYNC`; el estado debe indicar alineación temporal.
5. Con motores parados, compara la corriente mostrada con un multímetro y
   revisa la calibración del shunt.

## Criterios de aceptación

Antes del primer ensayo completo deben cumplirse simultáneamente:

- Montura detectada con parámetros plausibles.
- Sentido de AR y DEC comprobado mediante un desplazamiento corto.
- Logger sincronizado y sin crecimiento rápido de `OVF`.
- Lectura en reposo plausible y sin `OOR`.
- Recorrido libre de topes y cableado.
- Parada física accesible.

## Compilación del firmware

Consulta [Flipper Zero y cadena ADC](Flipper-Zero.md). El FAP debe compilarse
contra una API compatible con el firmware instalado; que un binario copie
correctamente no garantiza compatibilidad de ABI.
