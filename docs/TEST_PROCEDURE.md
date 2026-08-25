# Procedimiento de calibración del worm-gear

## Antes de energizar

1. Inspecciona el shunt, masa común, aislamiento y polaridad con la montura sin
   alimentación.
2. Comprueba que PA7 nunca pueda recibir la línea de 12 V.
3. Equilibra el tubo y contrapesos. Verifica que una vuelta del eje no alcance
   un tope ni enrolle alimentación, USB, cámaras o calefactores.
4. Ten al alcance la parada física de la montura. La parada web es una segunda
   barrera, no sustituye cortar la alimentación.

## Preparar el sistema

1. Ejecuta `npm run dev` y abre la URL local en Chrome/Edge.
2. Conecta la montura en **Ajustes** a 9600, 8 bits, sin paridad, 1 stop.
3. Ejecuta **Escanear montura**. Deben aparecer CPR, timer y ratio de ambos ejes.
4. Ejecuta `NEQ6 Current` en el Flipper y conecta BLE o el segundo USB-COM.
5. Espera a `ALINEADO`. Si no aparece, pulsa `SYNC`.
6. Con el motor quieto, observa que la corriente sea plausible y que `OOR/OVF`
   permanezcan en cero.

## Primera ejecución recomendada

Haz primero un test corto/manual de movimiento sin instrumentación para validar
el sentido y la holgura. Para la primera captura automática usa:

- 1 revolución.
- 500 Hz de ADC (valor inicial recomendado).
- 3,34 °/s como máximo nominal, o una velocidad menor para la primera prueba.
- Sentido CW o CCW según el recorrido seguro de cables y contrapesos.
- El eje con menor riesgo de cables o colisión.

En **Test ejes**, el panel derecho contiene únicamente eje, vueltas, muestreo,
velocidad, velocidad programada/medida, muestras por grado, progreso, inicio y parada. Al pulsar inicio se borra la vista actual,
el eje recorre 2° en sentido contrario al seleccionado y después invierte el giro para alcanzar su régimen. La captura
ADC comienza únicamente cuando el feedback `:j` confirma el cruce por 0°; el
motor no se detiene allí. La gráfica de la izquierda crece durante la adquisición.

La carrerilla usa un GOTO corto. La medición usa movimiento continuo, sin destino
interno: configura primero el modo `:G`, después el periodo `:I`, arranca con
`:J` y vigila `:j` hasta completar los grados reales antes de enviar `:K`.
0,199°/s utiliza modo lento y T1≈13 en esta NEQ6; el modo rápido sólo se activa
cuando el periodo lento ya no puede producir la velocidad solicitada.

La velocidad programada puede diferir de la solicitada por el redondeo entero
de T1 y por el límite T1≥6. La velocidad medida usa el desplazamiento devuelto
por `:j` y el tiempo entre consultas. Los ángulos de las muestras ADC son una
interpolación temporal entre estas anclas devueltas por la controladora.

En la NEQ6 con motores paso a paso, `:j` devuelve el contador interno ordenado
por la placa; no existe un encoder absoluto en la salida del eje. Por tanto
detecta correctamente cuánto recorrido ha contabilizado la controladora, pero
no demuestra que el rotor no haya perdido pasos durante un bloqueo mecánico.

Las vistas Polar y Cartesiano se actualizan durante la captura. `bloque ×1`
representa todas las muestras que ya tienen ángulo; `bloque ×50`, por ejemplo,
genera un punto por cada 50 muestras consecutivas. En Cartesiano aparecen barras
de error estándar tanto horizontales (ángulo) como verticales (corriente). El
CSV procesado exporta esas mismas medias, errores y el tamaño de cada bloque.
La tabla FFT añade «cada (montura)»: periodo × velocidad medida, expresado en
grados, para localizar la separación angular de cada repetición dominante.
El eje FFT muestra el espectro completo hasta Nyquist. La tabla básica conserva los
cinco picos principales automáticos (`A1`–`A5`); pulsa sobre el espectro para
añadir selecciones manuales (`M1`…) y usa × para quitar sólo estas últimas.
Todas las gráficas admiten zoom con rueda, pan con botón derecho, zoom rectangular
tipo Matplotlib y botón Restaurar. Al pulsar un
punto Polar o Cartesiano se puede ordenar un reposicionado al ángulo elegido.
`I RMS` es el valor eficaz móvil de los últimos 0,5 segundos.

**Test básico** realiza una sola pasada. **Test extendido** realiza cinco fases:
20 s de ruido con los motores parados y cuatro vueltas a la velocidad seleccionada
y su 50 %, ambas en CW y CCW. La tasa ADC de la velocidad lenta se reduce en la
misma proporción para conservar aproximadamente las muestras por grado. Conserva ADC y feedback
de cada pasada y compara los picos FFT. Periodo angular estable entre velocidades
y sentidos se clasifica como indicio mecánico; frecuencia en Hz estable pese al
cambio de velocidad, como posible electrónica/muestreo. Es una clasificación
orientativa, no la identificación automática de una pieza.

Durante el test extendido las curvas terminadas permanecen visibles con colores
distintos. Al finalizar se añade un perfil promedio grueso y Estadísticas muestra
primero el resumen entre pasadas y después un bloque por pasada. El análisis
comparativo conserva hasta 40 máximos locales de cada FFT; una «coincidencia»
reúne picos compatibles en frecuencia temporal o periodicidad angular.

La dirección circular se calcula ponderando cada ángulo por la corriente. `R̄`
próxima a 1 indica una carga concentrada hacia esa dirección; próxima a 0 significa
distribución casi uniforme o sectores opuestos que se cancelan. Con `R̄` baja, el
ángulo asociado no debe interpretarse como una posición dominante.

Al terminar, Polar dibuja el ajuste elíptico y sus dos ejes; sus parámetros
también aparecen en Estadísticas. **Exportar todo** descarga un ZIP con las
gráficas, CSV, FFT y resumen. Comprueba que el recorrido final confirmado por
`:j` sea el objetivo completo: una captura incompleta ya no se etiqueta como
terminada.

Pulsa **Parada de emergencia** ante ruido anormal, atasco, aumento brusco de
corriente o riesgo de cable. El motor recibe `:L` y el logger recibe `STOP`; el
registro parcial se conserva para diagnóstico.

## Interpretación

- Un patrón repetido a igual ángulo entre vueltas sugiere excentricidad,
  engrane irregular o variación periódica de precarga.
- Un nivel general más alto en un sentido puede indicar desequilibrio.
- Picos aislados pueden ser cables, suciedad, golpes o errores de transporte;
  comprueba `OVF` y repite antes de ajustar mecánica.
- Ajusta el worm-gear en incrementos pequeños, repite con la misma velocidad y
  compara sesiones crudas. No ajustes basándote solo en datos promediados.

Exporta siempre el CSV crudo antes de una intervención mecánica importante.
