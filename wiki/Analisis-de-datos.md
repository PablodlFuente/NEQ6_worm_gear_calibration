# Análisis de datos

## Polar

![Gráfica polar](images/analisis-polar.png)

Representa corriente como radio y posición como ángulo. Al finalizar se ajusta
una elipse y se muestran centro, semiejes, inclinación, excentricidad y residuo.

## Cartesiano

![Gráfica cartesiana](images/analisis-cartesiano.png)

El eje X son grados y el eje Y amperios. `×1` conserva cada muestra posicionada.
`×N` agrupa N muestras; las barras muestran el error estándar en X e Y.

## FFT

La FFT usa ventana de Hann y presenta el espectro hasta Nyquist. A1–A5 son los
cinco picos automáticos; M1… son selecciones manuales eliminables. La columna
angular es `periodo × velocidad medida :j`.

## Exportación

**Exportar todo** genera un ZIP con CSV crudo, CSV procesado, FFT, imágenes y
resumen JSON. Guarda el crudo antes de ajustar mecánicamente.
