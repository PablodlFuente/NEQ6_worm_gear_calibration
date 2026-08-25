# Protocolo y movimiento

## Capa MC de Sky-Watcher

La NEQ6 usa comandos ASCII con estructura:

```text
:<comando><canal><datos><CR>
```

CH1 es AR/RA y CH2 es DEC. La aceptación normal es `=<CR>` y el error comienza
por `!`. Los enteros multibyte se escriben como pares hexadecimales desde el
byte menos significativo al más significativo. Las posiciones añaden además
el offset protocolario `0x800000`; son transformaciones distintas.

La referencia consolidada documenta framing y codificación en pp. 2-3,
movimiento en pp. 4-5, cálculo de velocidad y posiciones en p. 7, y el modelo
transaccional en pp. 9-10 [R1].

## Diagnóstico de la montura

La aplicación consulta como mínimo:

| Comando | Magnitud | Uso |
|---|---|---|
| `e` | versión de placa | compatibilidad y código de montura |
| `a` | cuentas por revolución | grados <-> pasos |
| `b` | frecuencia de timer | cálculo del periodo T1 |
| `g` | ratio de alta velocidad | régimen rápido |
| `f` | estado | parado, dirección, velocidad, inicialización |
| `j` | posición | progreso y anclas angulares |

Los valores se obtienen del equipo conectado; no deben reemplazarse por una
constante copiada de otra variante EQ6.

## Velocidad lenta y rápida

En régimen lento, para una velocidad `v` en grados por segundo:

```text
counts_per_s = v * CPR / 360
T1 = timer_hz / counts_per_s
```

El régimen rápido incorpora el ratio de alta velocidad de la montura. La
aplicación cuantiza T1 a entero e impone el límite mínimo admitido. Por ello la
velocidad programada puede diferir ligeramente de la solicitada. “800” en
EQMOD representa normalmente 800 veces la velocidad sideral, no 800 °/s; en la
NEQ6 equivale aproximadamente al entorno de 3,34 °/s.

No se cambia a modo rápido por la longitud del recorrido, sino cuando el modo
lento ya no puede producir la velocidad pedida de forma válida. Un movimiento
de 0,199 °/s debe permanecer en modo lento (T1 cercano a 13 para los parámetros
observados en esta unidad).

## Jog, movimiento continuo y GOTO

- **Jog:** movimiento continuo mientras se mantiene una flecha; al soltar se
  solicita parada suave.
- **Movimiento continuo:** configura modo/dirección (`G`), periodo (`I`) y
  arranca (`J`). Termina con parada suave (`K`) o inmediata (`L`).
- **GOTO:** define un desplazamiento relativo (`H`), punto de frenado (`M`) y
  arranca con `J`. La placa administra el frenado hacia el destino.

El test usa GOTO corto para la carrerilla y movimiento continuo durante la
adquisición. Así evita que una limitación de destino interno corte una vuelta y
permite detenerse cuando el feedback confirme el recorrido completo.

## Parada y confirmaciones

`K` desacelera; `L` detiene inmediatamente y puede producir esfuerzos mayores.
Los comandos de escritura persistente, posición o bootloader requieren
confirmación en la interfaz. `L1` y `L2` no la requieren porque introducir un
diálogo en una parada urgente sería contraproducente.

## Qué significa “posición real” aquí

La posición consultada es real respecto al estado interno de la controladora,
no respecto a un encoder externo. La aplicación calcula progreso y velocidad
desde variaciones de ese contador y timestamps de respuesta. Si el motor pierde
pasos, el contador puede seguir avanzando: una gráfica aparentemente completa
no demuestra por sí sola una vuelta mecánica completa.

## Referencias

- [R1: protocolo completo incluido](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/SkyWatcher_EQ6_Protocolo_investigacion.pdf)
- [R2: INDI skywatcherAPI.h](https://github.com/indilib/indi/blob/master/drivers/telescope/skywatcherAPI.h)
- [R3: INDI skywatcherAPI.cpp](https://github.com/indilib/indi/blob/master/drivers/telescope/skywatcherAPI.cpp)
