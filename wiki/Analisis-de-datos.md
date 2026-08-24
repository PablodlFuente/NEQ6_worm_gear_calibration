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

En el test extendido se comparan hasta 40 máximos locales por cada una de las
cuatro pasadas. Las coincidencias reúnen picos que conservan aproximadamente la
frecuencia temporal o la periodicidad angular. Las curvas se mantienen por color
y una línea blanca muestra el perfil medio entre pasadas.

## Estadísticas

Se presentan por separado Adquisición, Estadística básica, Estadística angular
y Ajuste elíptico. La corriente se expresa como `media ± σ`; `media ± SEM`
indica la incertidumbre estadística de la media, no la dispersión individual.

La estadística circular pondera cada ángulo por su corriente. La dirección
circular señala hacia dónde se concentra la asimetría de carga. `R̄` próxima a
1 indica una dirección dominante; próxima a 0 indica una distribución casi
uniforme o sectores opuestos que se cancelan. Con `R̄` baja, el ángulo medio no
es representativo.

## Exportación

**Exportar todo** genera un ZIP con CSV crudo, CSV procesado, FFT, imágenes y
resumen JSON. Guarda el crudo antes de ajustar mecánicamente.
