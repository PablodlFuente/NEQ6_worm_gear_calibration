# Uso y seguridad

## Movimiento

- **Movimiento:** GOTO por grados con velocidad programada y medida.
- **Jog:** movimiento mientras se mantiene pulsada una flecha.
- **STOP:** parada suave.
- **¡YA!:** parada inmediata.
- **HOME:** referencia de la controladora; no es un home mecánico.

## Test de ejes

1. Selecciona AR o DEC.
2. Elige CW (horario) o CCW (antihorario).
3. Indica 1–10 vueltas, tasa ADC y velocidad.
4. Verifica que montura y ADC estén en verde.
5. Inicia el test.

La carrerilla siempre usa el signo contrario. Para 2° se emplea GOTO lento
(modo 2, `:M=200`); para la vuelta, GOTO rápido (modo 0, `:M=3200`).

## Comandos peligrosos

Los comandos rojos que modifican posición, memoria o firmware presentan una
confirmación. `L1` y `L2` no: retrasar una parada inmediata sería peligroso.

## Lista de seguridad

- Prueba primero sin carga y con pocos grados.
- Evita topes y cables que puedan enrollarse.
- No conectes 12 V a PA7.
- Conserva una parada física accesible.
- Si el motor vibra o pierde par, corta alimentación y revisa el log.
