# Guía visual de la interfaz

Esta guía documenta la versión de la interfaz incluida en el repositorio. Para
la teoría de medida y la interpretación estadística consulta la [página de inicio](Home.md).

## Movimiento

![Movimiento](images/movimiento_view.png)

- **Girar** ejecuta un desplazamiento con destino y frenado.
- Las flechas hacen jog continuo; al soltar se solicita parada suave.
- La posición inferior es feedback del contador MC (`:j`), no un encoder
  mecánico independiente.

## Serial

![Serial](images/serial_view.png)

El monitor registra TX, RX y mensajes del sistema. Los modos ASCII, HEX y Ambos
afectan sólo a la presentación. La exportación del monitor sirve para conservar
la evidencia de una secuencia de protocolo completa.

## Ajustes

![Ajustes](images/ajustes_view.png)

Aquí se conectan montura y Flipper, se diagnostican firmware/CPR/TMR/ratio HS y
se configura la calibración ADC. No debe inferirse una velocidad límite a partir
de una sola razón TMR/CPR: el modo rápido introduce su propio multiplicador.

## Captura activa

![Captura activa](images/test-en-ejecucion.png)

La captura empieza después de la carrerilla y termina al completar el recorrido
medido. El motor continúa 2° sin ADC para que la rampa de frenado no contamine
el final del perfil.

## Estadísticas en curso

![Estadísticas en curso](images/test-en-ejecucion-estadisticas.png)

Los valores durante REC son provisionales. Media, desviación, SEM, estadística
circular y elipse responden a preguntas distintas; no deben condensarse en un
único indicador de “calidad”.

## FFT

![FFT](images/test-en-ejecucion-fft.png)

Los picos automáticos se complementan con selecciones manuales. Hz describe una
periodicidad temporal; `° por repetición` la proyecta sobre el movimiento real
del eje.

## Análisis FFT extendido

![Análisis FFT extendido](images/test-en-ejecucion-fft-analisis.png)

La fase de ruido estacionario proporciona evidencia de origen eléctrico. Las
cuatro pasadas móviles permiten buscar estabilidad en Hz, estabilidad angular y
armónicos. El resultado es una hipótesis clasificada, no una identificación
automática de componentes.

## Polar

![Polar](images/analisis-polar.png)

Útil para localizar direcciones y sectores de carga y para visualizar el ajuste
elíptico. Las curvas del test extendido son seleccionables desde la leyenda.

## Cartesiano

![Cartesiano](images/analisis-cartesiano.png)

Útil para zoom cuantitativo, barras de error y comparación por ángulo. La rueda
hace zoom, el botón derecho desplaza y la lupa rectangular reescala ambos ejes.
