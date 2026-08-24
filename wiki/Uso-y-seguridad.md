# Uso y seguridad

## Movimiento

- **Movimiento:** GOTO hasta unos grados concretos, con frenado en destino.
- **Jog:** velocidad continua mientras se mantiene pulsada una flecha.
- **STOP:** parada suave.
- **¡YA!:** parada inmediata.
- **HOME:** referencia de la controladora; no es un home mecánico.

## Test de ejes

1. Selecciona AR o DEC.
2. Elige CW (horario) o CCW (antihorario).
3. Indica 1–10 vueltas, tasa ADC y velocidad.
4. Verifica que montura y ADC estén en verde.
5. Inicia el test.

La carrerilla siempre usa el signo contrario y un GOTO corto. La vuelta medida
usa velocidad continua y se detiene mediante feedback `:j`: modo 1 a baja
velocidad y modo 3 únicamente cuando hace falta el ratio rápido. Así T1=13 a
0,199°/s permanece en lento y no cambia a ráfagas de 16 micropasos.

## Comandos peligrosos

Los comandos rojos que modifican posición, memoria o firmware presentan una
confirmación. `L1` y `L2` no: retrasar una parada inmediata sería peligroso.

## Lista de seguridad

- Prueba primero sin carga y con pocos grados.
- Evita topes y cables que puedan enrollarse.
- No conectes 12 V a PA7.
- Conserva una parada física accesible.
- Si el motor vibra o pierde par, corta alimentación y revisa el log.
