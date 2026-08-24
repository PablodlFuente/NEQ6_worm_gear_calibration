# Flipper Zero

`NEQ6 Current` muestrea PA7/A7 y transmite timestamp más ADC crudo.

## Transporte

- **BLE:** enlace inalámbrico preferente durante el prototipo.
- **USB-COM:** respaldo más estable. Usa CDC1; CDC0 queda para CLI/qFlipper.

Ambos aceptan `INFO`, `RATE <Hz>`, `SYNC`, `START` y `STOP`.

## Conversión

`I = adc_raw × 2,5 × 1,0025189 / 4096 / 0,323`

El CSV crudo conserva `adc_raw`, por lo que una calibración futura no destruye
la medida original. `I RMS₅₀` es el valor eficaz de las últimas 50 muestras.

Consulta también `docs/FLIPPER_SETUP.md` y `docs/FLIPPER_PROTOCOL.md`.
