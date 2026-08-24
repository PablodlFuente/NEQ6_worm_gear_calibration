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
2. La web retrocede 2° mediante un destino absoluto corto `:S`, arranca después
   un único GOTO relativo `:H` en el sentido de medida y espera a que el feedback
   `:j` confirme que se han recuperado esos 2°.
3. En ese cruce por 0° configura `RATE` y confirma `START`. La vuelta completa
   continúa sin parada intermedia: unas 9,02 M cuentas caben en el campo relativo
   sin signo de 24 bits de `:H` (`0xFFFFFF`).
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
`I = raw × 2.5 × 1.0025189 / 4096 / 0.323`. Desde el firmware v3.1, la protección
0–2,5 A compara el crudo con el umbral matemáticamente equivalente. Evita hacer
una conversión HAL costosa en cada muestra, que limitaba una petición de 1000 Hz
a aproximadamente 320 Hz. El CSV crudo siempre permite reprocesar una sesión.

El ángulo se obtiene por sondeo, no por una marca de encoder en cada muestra.
La curva angular es una interpolación entre posiciones reales; aumentar mucho
la tasa ADC no aumenta la resolución temporal de las consultas a la montura.
Las anclas proceden exclusivamente de `:j`; no se integra la velocidad teórica.
El CSV procesado lo declara como `angle_source=mount_:j_feedback_time_interpolated`.

La velocidad solicitada se cuantiza con `T1 = timer × 360 / (velocidad × CPR)`.
Se respeta el mínimo documentado T1=6. La interfaz distingue la velocidad
programada (resultado entero de T1) de la velocidad medida entre anclas `:j`.
La medida usa la mediana de las velocidades de los segmentos con desplazamiento,
por lo que ignora esperas de preparación y lecturas repetidas una vez parado.
Las muestras por grado se estiman antes del test como `rate/velocidad_programada`
y se recalculan después con recorrido y muestras realmente posicionadas.

El selector `bloque ×N` agrupa muestras consecutivas, no bins angulares. Con
`×1` cada muestra se representa; con `×N` cada punto contiene la media y el
error estándar (SEM) de corriente y ángulo. El CSV procesado usa la misma serie.
La tabla de picos FFT convierte cada periodo temporal a grados mediante la
velocidad medida por `:j`; sin feedback válido esa celda queda vacía.

El objetivo absoluto `:S` es modular de 24 bits. Los incrementos mayores de
`0x7fffff` son ambiguos: una vuelta EQ6 de unas 9,02 M cuentas puede resolverse
como el complemento de unas 7,76 M cuentas (~309°). Por eso cada GOTO absoluto
normal se divide en tramos de media escala como máximo. El test de ejes evita
esa discontinuidad usando la magnitud relativa `:H`; sólo se declara completo
cuando el recorrido acumulado de `:j` alcanza al menos el 99,5 %.

Al terminar la captura, la nube Polar se convierte a coordenadas cartesianas y
se ajusta por PCA una elipse. Se guardan centro, semiejes, inclinación,
excentricidad y residuo RMS. La interfaz muestra además la corriente RMS móvil
de las últimas 50 muestras. La exportación única genera un ZIP con las cuatro
gráficas PNG, ambos CSV, espectro FFT, picos y resumen JSON.
