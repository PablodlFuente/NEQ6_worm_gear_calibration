# NEQ6 Current Logger (Flipper Zero)

Aplicación externa para medir en **PA7 (pin físico 2)** la caída del shunt de
**0,323 ohm** y transmitir el ADC sin procesar a la web.

## Compilación

```powershell
ufbt update
ufbt
ufbt launch
```

Ejecuta los comandos dentro de esta carpeta y cierra qFlipper antes de `launch`.
El SDK descargado por `ufbt update` debe corresponder al firmware instalado.

La versión v3.1 elimina la conversión HAL por muestra que limitaba la tasa
efectiva alta. `INFO` y la web permiten comprobar `OOR`, `OVF` y la tasa medida.
Para el Momentum probado en este proyecto se incluye también el binario
`release/neq6_current_logger-momentum-api87.1.fap`; si el firmware del Flipper
usa otra API, recompila las fuentes en lugar de forzar ese FAP.

## Transportes

- BLE Serial de Flipper: servicio `8fe5b3d5-2e7f-4a98-2a48-7acc60fe0000`.
- USB dual CDC: CDC0 continúa disponible para qFlipper/CLI y CDC1 aparece como
  un segundo puerto COM para la adquisición.

Los dos transportes usan el mismo protocolo; no deben abrirse simultáneamente.

## Medida

La conversión de rango se realiza con la función oficial
`furi_hal_adc_convert_to_voltage`, se multiplica por `1.0025189` y se divide
por `0.323`. Las muestras fuera de 0-2,5 A se cuentan como `OOR` y no se envían.
La trama conserva `adc_raw` para no cambiar el protocolo existente.

Consulta `../../docs/FLIPPER_SETUP.md` para instalación, emparejamiento y
diagnóstico.
