# NEQ6 Current Logger — FAP para Flipper Zero

App externa (`.fap`) que mide la corriente del motor AR de una NEQ6 mediante un shunt en
**PA7 (pin 2 del GPIO)** y la envía por Bluetooth al programa web.

## Compilar y lanzar con ufbt

```bash
# dentro de la carpeta descomprimida
ufbt update            # solo la primera vez: descarga el SDK de tu canal
ufbt                   # compila → neq6_current_logger.fap
ufbt launch            # lo carga en el Flipper por USB
```

Con **Momentum**, apunta ufbt a su SDK:

```bash
ufbt update --index-url=https://up.momentum-fw.dev/firmware/directory.json
```

No se fija `ApiVersion` en `application.fam`: se compila contra el nivel de API del SDK
descargado, así no aparece `ApiTooNew`.

## Emparejamiento

La app anuncia el Flipper con su nombre habitual. Al conectar desde la web, si el Flipper
exige PIN, **el código aparece en su pantalla** (`PIN pairing: XXXXXX`): introdúcelo en el
diálogo del sistema.

## API utilizada (SDK actual, sin APIs obsoletas)

- **NO** usa `furi_hal_bt_serial.h` (no existe) ni la variable `ble_profile_serial`
  (deshabilitada para FAPs).
- **BLE**: funciones `ble_profile_serial_*` de `<extra_profiles.h>` — son exactamente las que
  usa la app oficial *Bluetooth Serial* (que es un FAP externo), por lo que están exportadas
  en la tabla de API. El perfil es el serie del propio firmware
  (`19ed82ae-ed21-4c9d-4145-228e60fe0000`), el mismo que espera la web.
- **ADC**: `furi_hal_adc_configure_ex(Scale2500, ClockSync64, OversampleNone,
  Samplingtime247_5)` + conversión oficial `furi_hal_adc_convert_to_voltage()`; PA7 =
  `FuriHalAdcChannel12`.
- **Timestamp µs**: contador de hardware DWT (CMSIS, sin símbolos del firmware), convertido
  con `furi_hal_cortex_instructions_per_microsecond()`. El campo u32 desborda cada ~67 s; la
  web desenvuelve los deltas.
- **Tasa 10–1000 Hz**: FuriTimer + cola de mensajes. El tick del kernel es de 1 ms, así que
  el periodo se redondea a 1 ms (a 1000 Hz, una muestra por tick; el timestamp real viene del
  DWT, no del timer).

## Cadena de medida

```
NEQ6 → shunt 0.323 Ω ((0.17+0.17)//0.65 + 0.10)
     → PA7 / ADC (2.5 V, 12 bits)
     → V = HAL oficial (mV)
     → V_cal = V × 1.0025189   (calibración experimental)
     → I = V_cal / 0.323       (rango 0–2.5 A; fuera de rango → drop)
     → ring buffer 2048
     → BLE → PC
```

## Protocolo (idéntico al de la web)

- PC → Flipper: `START` · `STOP` · `RATE <10..1000>` · `SYNC` · `INFO`
- Flipper → PC: `OK` · `ERR ...` · `SYNC <µs>` · `INFO ...`
- Muestras binarias (8 B): `A5 5A | ts µs u32 LE | adc raw u16 LE`
