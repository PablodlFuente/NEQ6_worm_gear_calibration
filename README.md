# NEQ6 Worm-Gear Calibration

Herramienta web para mover un eje de una montura SkyWatcher NEQ6/EQ6, medir
su corriente con un shunt y relacionar cada muestra con el ángulo del eje. El
objetivo es encontrar variaciones periódicas de carga y ajustar el contacto del
worm-gear sin perder el registro crudo.

## Estado actual

- Control de la montura por Web Serial a 9600 8N1 mediante EQDirect.
- Test automático de 1 a 10 vueltas en AR o DEC, con velocidad y muestreo
  configurables, progreso en vivo y parada inmediata.
- Logger para Flipper Zero en PA7/pin 2, calibrado con `K=1.0025189` y shunt de
  `0.323 Ω`.
- Dos transportes equivalentes para el logger: BLE Serial y USB dual CDC
  (segundo puerto COM).
- Gráficas temporal, por ángulo, polar y espectral con zoom/pan, picos FFT
  seleccionables y ajuste elíptico final. Exportación ZIP de PNG, CSV, FFT y
  resumen; sesiones locales en IndexedDB.
- Verificación de recorrido exclusivamente por feedback `:j`, GOTO absolutos
  divididos para evitar la ambigüedad modular de 24 bits y firmware v3.1 con
  medición visible de la tasa ADC efectiva.

## Puesta en marcha rápida

```powershell
npm ci
npm run dev
```

Abre la URL local en Chrome o Edge. Instala y ejecuta antes la aplicación
`NEQ6 Current` del directorio `flipper_fw/neq6_current_logger`. En **Ajustes**,
conecta la montura y el Flipper; ejecuta **Escanear montura**. Después abre
**Test ejes**, configura la vuelta y pulsa **Iniciar test sincronizado**.

> **Seguridad eléctrica y mecánica:** PA7 admite una señal de ADC, no los 12 V
> de la montura. El shunt debe cablearse en low-side, con masa común, protección
> adecuada y una caída siempre dentro de 0–2,5 V. Antes de una vuelta completa,
> libera los frenos, equilibra la carga, comprueba topes y evita que los cables
> puedan enrollarse. Mantén accesible la parada física de alimentación.

## Documentación

- [Índice de documentos](docs/README.md)
- [Arquitectura](docs/ARCHITECTURE.md)
- [Flipper: montaje, compilación y conexiones](docs/FLIPPER_SETUP.md)
- [Procedimiento del test](docs/TEST_PROCEDURE.md)
- [Protocolo del logger](docs/FLIPPER_PROTOCOL.md)
- [Diagnóstico de problemas](docs/TROUBLESHOOTING.md)

## Desarrollo y comprobación

```powershell
npm run check
cd flipper_fw\neq6_current_logger
..\..\.tools\ufbt-venv\Scripts\ufbt.exe
```

La aplicación requiere un contexto seguro (`localhost` o HTTPS) para Web
Serial y Web Bluetooth. Los datos de medida se mantienen crudos; filtros,
promedios y conversiones se calculan como vistas derivadas.
