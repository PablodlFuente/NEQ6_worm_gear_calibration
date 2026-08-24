# Arquitectura

## Flujo principal

```text
NEQ6/EQDirect -- 9600 8N1 --> Web Serial -- posición (:j) --+
                                                               +--> reloj común --> gráficas/CSV/IndexedDB
Flipper PA7 --> ADC/timestamp --> BLE o USB CDC1 --------------+
```

La aplicación React mantiene separados los dos enlaces. Los comandos de la
montura se serializan sobre su puerto COM y las respuestas se decodifican según
el protocolo del motor SkyWatcher. El logger usa BLE o un segundo COM, pero
ambos exponen exactamente el mismo protocolo.

## Test sincronizado

1. Se comprueban conexión de montura, CPR detectado, conexión del Flipper y
   sincronización válida.
2. La web limpia la captura, configura `RATE` y confirma `START`.
3. El motor se mueve por destinos absolutos de 24 bits. El recorrido modular
   admite hasta `0xFFFFFF` pasos por GOTO, separado del umbral firmado
   `0x7FFFFF` usado únicamente para desenvolver posición. Así una vuelta EQ6
   cabe en un solo movimiento; recorridos mayores sí se dividen en tramos.
4. Mientras el eje se mueve, la web intercala consultas `:j` de posición y `:f`
   de estado en la misma cola serie. No hay dos comandos de montura en vuelo.
5. Los timestamps del Flipper se trasladan al reloj del navegador mediante seis
   intercambios `SYNC`. La posición se interpola sobre ese mismo eje temporal.
6. Al completar, cancelar o fallar el movimiento se envía `STOP` al ADC. Los
   datos parciales se conservan y también se incorporan las últimas tramas que
   el ring del Flipper termine de vaciar después de confirmar STOP.

## Módulos relevantes

- `src/App.tsx`: control de la montura y coordinador del test.
- `src/hooks/useSerial.ts`: transporte Web Serial reutilizable.
- `src/hooks/useBle.ts`: perfil BLE Serial oficial del Flipper.
- `src/hooks/useFlipperSerial.ts`: transporte USB CDC1.
- `src/hooks/useFlipper.ts`: protocolo común, sincronización, captura y análisis.
- `src/lib/flipper.ts`: parser, calibración, CSV y procesado matemático.
- `flipper_fw/neq6_current_logger`: aplicación externa del Flipper.

## Integridad y límites

Las muestras transmiten `adc_raw`; la corriente se calcula en la web con
`I = raw × 2.5 × 1.0025189 / 4096 / 0.323`. El firmware usa además la conversión
oficial HAL para decidir si la muestra está dentro de 0–2,5 A, sin alterar el
protocolo. Por ello el CSV crudo siempre permite reprocesar una sesión.

El ángulo se obtiene por sondeo, no por una marca de encoder en cada muestra.
La curva angular es una interpolación entre posiciones reales; aumentar mucho
la tasa ADC no aumenta la resolución temporal de las consultas a la montura.

El selector `bloque ×N` agrupa muestras consecutivas, no bins angulares. Con
`×1` cada muestra se representa; con `×N` cada punto contiene la media y el
error estándar (SEM) de corriente y ángulo. El CSV procesado usa la misma serie.
