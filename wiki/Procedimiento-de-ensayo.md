# Procedimiento de ensayo

## Verificación previa

- Diagnóstico de montura sin errores y parámetros CPR/timer válidos.
- `INFO` del logger coherente; `OOR=0` y `OVF` estable.
- `SYNC` válido.
- Lectura estacionaria comparada con multímetro.
- Movimiento corto en el sentido elegido.

## Test básico

El test básico caracteriza una combinación de eje, sentido, velocidad y carga:

1. Ejecuta un GOTO de 2° opuesto al sentido de medida.
2. Invierte el sentido y acelera antes del origen de adquisición.
3. Cuando el feedback cruza el origen, inicia la adquisición angular y de corriente.
4. Mantiene movimiento continuo y consulta posición.

La carrerilla elimina del intervalo útil el transitorio principal de arranque.
La marcha motriz total es, por tanto, `recorrido útil + 2°`: esos dos grados
permiten que la frenada ocurra fuera del perfil. La posición final debe coincidir
con el origen anterior a la carrerilla, dentro de la resolución y tolerancia del
controlador.

## Test extendido

El protocolo extendido separa dependencias temporales y angulares mediante
cinco fases:

1. 20 s con motores parados: referencia de ruido eléctrico o de muestreo.
2. Velocidad rápida, CW.
3. Velocidad rápida, CCW.
4. Velocidad lenta (50 %), CW.
5. Velocidad lenta, CCW.

La tasa ADC lenta se reduce proporcionalmente para mantener aproximadamente
constantes las muestras por grado. Cada fase conserva su señal, estadísticas y
espectro; el promedio FFT excluye la fase estacionaria.

### Diseño experimental

- Repite el extendido tras cualquier ajuste, sin cambiar simultáneamente carga,
  tasa, velocidad y apriete.
- Compara CW y CCW para detectar histéresis, holgura o efectos de equilibrado.
- Compara periodicidad en grados, no sólo amplitud en amperios.

## Criterios de interrupción

Detén inmediatamente ante vibración, ruido mecánico anormal, aumento brusco de
corriente, crecimiento de `OOR`, pérdida visible de velocidad, tensión de cables
o proximidad a un tope. Un ensayo parcial es más útil que una avería.

## Trazabilidad mínima

Conserva el ZIP exportado antes y después del ajuste. El nombre identifica eje y
tipo de test; los CSV guardan sentido, calibración y muestras individuales. A
