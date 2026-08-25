# Arquitectura y modelo de medida

## Separación de enlaces

La aplicación mantiene dos enlaces independientes. El EQDirect transporta el
protocolo ASCII del motor controller a 9600 8N1. El Flipper transporta comandos
de adquisición y tramas ADC mediante BLE Serial o USB CDC1. Mezclar ambos
puertos o permitir dos consumidores simultáneos rompe el modelo transaccional.

```text
Navegador
  |-- Web Serial 9600 8N1 --> EQDirect --> placa de motores NEQ6
  `-- BLE Serial o CDC1 ----> Flipper --> ADC PA7 --> shunt low-side
```

La interfaz ejecuta las operaciones del motor como transacciones ordenadas. Un
comando de la montura debe recibir `=` o `!` terminado en CR antes de que se
emita la siguiente orden dependiente. El logger, en cambio, multiplexa comandos
ASCII con tramas binarias de muestra.

## Cadena de corriente

Para una lectura de 12 bits, la conversión utilizada es:

```text
I [A] = adc_raw * 2.5 * K / (4096 * R_shunt)
```

`R_shunt` y `K` se guardan con la sesión. `adc_raw` se conserva siempre para
permitir una recalibración posterior. La tensión de carga del shunt es
`V_shunt = I * R_shunt`; su valor y disipación `P = I²R` deben verificarse para
la corriente máxima prevista. La aplicación no sustituye ese dimensionado.

## Relojes y sincronización

Cada muestra contiene `t_us`, el contador monotónico del Flipper. En cada
intercambio `SYNC`, la web registra envío y recepción, estima el instante del
Flipper en el punto medio del RTT y obtiene un desfase. Usa la mediana de varias
medidas para reducir el efecto de latencias puntuales.

```text
timestamp_web_ms = t_us / 1000 - offset_ms
```

La sincronización no hace simultáneos los dos buses: permite ordenar las
muestras ADC respecto a las respuestas de posición. El jitter y las lagunas de
transporte limitan la precisión temporal real.

## Posición y ángulo de muestra

La posición de la montura procede de consultas periódicas al contador de la
placa de motores. Cada respuesta crea un punto `(timestamp, posición)`. Para una
muestra situada entre dos puntos se usa interpolación lineal temporal. No se
integra la velocidad solicitada y no se inventa el final de una captura si
faltan anclas.

El ángulo exportado se normaliza a `[0, 360)` y `rev` comienza en 1. Para los
cálculos internos se conserva también el ángulo desenvuelto, imprescindible
para distinguir 359° -> 1° de un salto hacia atrás.

### Limitación fundamental

El feedback confirma pasos contabilizados por la electrónica. No confirma la
posición física del conjunto telescopio-eje ante deslizamiento, acoplamiento
suelto o pérdida de pasos. Por eso la velocidad medida es superior a una
estimación por tiempo, pero no equivale a un encoder metrológico externo.

## Datos inmutables y vistas derivadas

Los buffers de adquisición almacenan timestamp, ADC y anclas angulares. El
selector `promedio x N` sólo cambia la vista: no reduce los datos conservados.
Las gráficas, estadísticas, sectores, elipse y FFT son productos derivados y
pueden recalcularse sin alterar las muestras originales.

## Implementación relacionada

- Adquisición, sincronización y exportación: [`src/hooks/useFlipper.ts`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/src/hooks/useFlipper.ts)
- Interpolación, estadística y CSV: [`src/lib/flipper.ts`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/src/lib/flipper.ts)
- Secuencias de movimiento: [`src/App.tsx`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/src/App.tsx)
- Referencia del protocolo MC: [PDF, pp. 2-10](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/SkyWatcher_EQ6_Protocolo_investigacion.pdf)
