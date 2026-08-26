# Registro y diagnóstico

## Registro automático

El servidor de desarrollo escribe JSONL en `logs/AAAA-MM-DD.jsonl`. Cada línea
es independiente e incorpora timestamp de cliente y servidor, IP observada,
User-Agent, acción, mensajes y tráfico serie. `logs/` está excluido de Git.

La IP es la dirección que alcanza el servidor: normalmente `127.0.0.1` o `::1`
en el mismo equipo y una IP privada desde la LAN. No se consulta la IP pública.
Los logs pueden contener identificadores de puertos, comandos y hábitos de uso;
revísalos antes de compartirlos.

## Método de diagnóstico

1. Conserva el primer error, no sólo los mensajes posteriores.
2. Separa montura, logger y visualización como subsistemas.
3. Comprueba la secuencia TX/RX y los timestamps.
4. Reproduce con recorrido corto y sin carga peligrosa.
5. Cambia una variable cada vez.

## La montura no conecta

- Confirma EQDirect, 9600 8N1 y terminación CR.
- Cierra cualquier otro consumidor del COM.
- Comprueba alimentación y nivel eléctrico del adaptador.
- Busca respuestas `!`: `!2` implica motor no parado, `!4` no inicializado y
  `!5` driver dormido [R1, pp. 5 y 12].
- Repite el diagnóstico y verifica firmware, CPR, timer y ratio.

## El motor acelera y queda lento

En movimiento continuo deben aparecer selección de modo `G`, periodo `I`,
arranque `J`, estado `f` y posición `j`. Durante la vuelta no deberían aparecer
órdenes de destino `H/S` ni frenado `M/T`, salvo en la carrerilla.

Comprueba:

- modo lento para velocidades como 0,199 °/s;
- T1 coherente con timer, CPR y velocidad;
- uso del ratio rápido sólo al superar el régimen lento;
- velocidad medida desde posición, no sólo la programada;
- ausencia del bit de bloqueo en el estado `f`.

Si la placa contabiliza posición pero el eje físico pierde velocidad, sospecha
pérdida de pasos, carga excesiva, tensión insuficiente o una rama mecánica
atascada. Detén el ensayo.

## La captura termina antes de 360°

Compara recorrido confirmado, anclas de posición y hora de parada. El test debe
partir 2° antes, cruzar el origen en el sentido de medida y detenerse en el
origen previo a la carrerilla. Una muestra ADC posterior a la última ancla no
recibe ángulo por extrapolación.

Si el contador avanza mientras el eje físico está detenido, el sistema no puede
resolverlo sin un encoder externo. La discrepancia debe registrarse como pérdida
de pasos o bloqueo probable.

## Muestras por grado distintas de la estimación

La estimación usa tasa solicitada y velocidad programada. La medida usa muestras
recibidas con ángulo y recorrido confirmado. Difieren por:

- tasa ADC efectiva distinta de RATE;
- `OVF` o pérdida de transporte;
- muestras anteriores o posteriores al intervalo angular;
- variación real de velocidad;
- intervalos sin feedback de posición.

## `OVF` crece

El productor ADC está superando temporal o sostenidamente la capacidad de cola
y transporte. El timestamp preserva el orden, pero no recupera una muestra que
nunca entró en el buffer. Reduce RATE, usa CDC1, cierra consumidores USB y evita
consultas de control innecesarias durante adquisición.

## `OOR` crece

Detén y revisa la cadena eléctrica: caída del shunt, masa, referencia, rango,
polaridad, protección y calibración. No ajustes K para hacer desaparecer el
aviso sin verificar primero la tensión real en PA7.

## La gráfica no tiene ángulo

La corriente sigue siendo válida, pero faltan al menos dos anclas temporales de
posición que rodeen las muestras. Revisa consultas de posición, sincronización,
CPR y competencia por el puerto de montura.

## BLE inestable

- Ejecuta el FAP antes de escanear.
- Cierra qFlipper/RPC si ocupa el servicio.
- Elimina emparejamientos obsoletos si Windows conserva uno incompatible.
- Empieza a 100-250 Hz y observa tasa efectiva/OVF.
- Cambia a CDC1 si el objetivo es una captura larga o de alta tasa.

## Verificación de software

```powershell
npm ci
npm run check
cd flipper_fw\neq6_current_logger
..\..\.tools\ufbt-venv\Scripts\ufbt.exe
```
