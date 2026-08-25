# Procedimiento de ensayo

## Preparación mecánica y eléctrica

1. Documenta carga, contrapesado, eje, sentido, temperatura y estado del ajuste.
2. Comprueba disipación del shunt, masa común y tensión máxima en PA7.
3. Libera una vuelta completa y reserva margen para 2° antes y 2° después.
4. Sujeta los cables para que su par no dependa de la fase angular.
5. Deja accesible la desconexión física de alimentación.

Un cable que se tensa periódicamente puede producir una firma tan repetible
como un defecto del engranaje. El control de variables es parte del ensayo.

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
3. Cuando el feedback cruza el origen, inicia o acepta la adquisición angular.
4. Mantiene movimiento continuo y consulta posición.
5. Al alcanzar `360° * revoluciones`, detiene el ADC sin reducir la velocidad.
6. Continúa 2° fuera de captura, envía parada suave y corrige la posición final.

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
- Usa al menos dos repeticiones completas si la decisión implica desmontaje.
- Compara CW y CCW para detectar histéresis, holgura o efectos de equilibrado.
- Compara periodicidad en grados, no sólo amplitud en amperios.

## Criterios de interrupción

Detén inmediatamente ante vibración, ruido mecánico anormal, aumento brusco de
corriente, crecimiento de `OOR`, pérdida visible de velocidad, tensión de cables
o proximidad a un tope. Un ensayo parcial es más útil que una avería.

## Trazabilidad mínima

Conserva el ZIP exportado antes y después del ajuste. El nombre identifica eje y
tipo de test; los CSV guardan sentido, calibración y muestras individuales. Añade
en tu cuaderno de laboratorio la configuración mecánica que el software no puede
observar.

Consulta también el [procedimiento operativo](Procedimiento-operativo-de-calibracion.md).
