# Recorrido técnico por la interfaz

Esta página no sustituye el procedimiento de ensayo. Su objetivo es relacionar
cada superficie de la aplicación con el estado físico o lógico que representa.
Antes de actuar sobre la montura conviene distinguir tres canales: protocolo MC
de la montura, adquisición ADC del Flipper y procesamiento en el navegador.

## Movimiento manual

![Vista de movimiento](images/movimiento_view.png)

La pestaña **Movimiento** reúne giros de ángulo definido y *jog*. Un giro
programado tiene destino y frenado; un jog mantiene velocidad continua mientras
se pulsa una flecha. Los indicadores de posición del pie proceden de `:j`, pero
son cuentas del controlador, no un encoder mecánico independiente.

## Consola y protocolo serie

![Vista del monitor serie](images/serial_view.png)

La consola conserva orden temporal, dirección TX/RX y decodificación. Debe
utilizarse para comprobar la secuencia completa, no sólo el último comando. Las
órdenes de movimiento de bajo nivel dependen del modo `:G`, periodo `:I/:T`,
destino `:S/:H`, frenado `:M` y arranque `:J`; consulta
[Protocolo y movimiento](Protocolo-y-movimiento).

## Ajustes y diagnóstico

![Vista de ajustes](images/ajustes_view.png)

El diagnóstico lee firmware, CPR, temporizador y ratio de alta velocidad. CPR y
TMR no son valores ornamentales: determinan la conversión entre cuentas,
grados, T1 y velocidad. En esta vista también se elige el transporte del
Flipper y la calibración del shunt.

## Test durante la adquisición

![Test en ejecución](images/test-en-ejecucion.png)

Durante un test se muestran corriente instantánea, I RMS, muestras, progreso y
feedback. En la marcha básica, el motor retrocede 2°, invierte el sentido y
cruza el origen ya en régimen. La adquisición cubre exactamente el recorrido
solicitado; los 2° de salida y su frenada quedan fuera de la captura.

## Estadísticas durante el test

![Estadísticas durante la adquisición](images/test-en-ejecucion-estadisticas.png)

Las cifras provisionales cambian mientras llegan datos. No deben usarse como
resultado final hasta que la captura esté cerrada y exista suficiente cobertura
angular. La media se presenta con SEM; la desviación típica describe la
dispersión de las muestras y no es intercambiable con la incertidumbre de la
media.

## FFT de una serie

![FFT durante la adquisición](images/test-en-ejecucion-fft.png)

El eje horizontal está en Hz. Para un fenómeno ligado a la geometría interesa
también su periodo angular, calculado con la velocidad de feedback. La posición
de un pico durante una captura incompleta puede cambiar porque la resolución
espectral depende de la duración observada.

## Comparación FFT extendida

![Análisis comparativo FFT](images/test-en-ejecucion-fft-analisis.png)

El test extendido añade una fase de ruido con motores parados y cuatro pasadas
móviles. El ruido aparece aquí y en estadísticas, pero no como curva angular:
sin movimiento no existe un ángulo físico al que asignar sus muestras. La
clasificación mecánica, eléctrica o tren motor es comparativa y debe contrastarse
con la arquitectura de la montura.

## Representación polar

![Análisis polar](images/analisis-polar.png)

La fase angular rodea el círculo y el radio representa corriente. El círculo
medio, dirección de carga, sectores de carga y elipse resumen propiedades
distintas. Ocultar series recalcula el análisis con las curvas visibles; no
altera los datos guardados.

## Representación cartesiana

![Análisis cartesiano](images/analisis-cartesiano.png)

La misma medida se representa como corriente frente a ángulo. Es la vista más
adecuada para cuantificar anchuras, discontinuidades y barras de error. El
promedio por bloques controla la visualización y el CSV de promedios, nunca el
CSV de medidas individuales.

## Lectura siguiente

- [Procedimiento de ensayo](Procedimiento-de-ensayo)
- [Análisis de datos](Analisis-de-datos)
- [Formato de datos y exportación](Formato-de-datos-y-exportacion)
