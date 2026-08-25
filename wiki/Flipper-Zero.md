# Flipper Zero y cadena ADC

## Función del prototipo

El Flipper se usa como ADC y transporte temporal durante el desarrollo. No
forma parte del lazo de control del motor. Una futura placa ADC/microcontrolador
puede reemplazarlo si conserva el contrato de muestras y comandos.

## Entrada y calibración

- Entrada: PA7/A7, GPIO físico pin 2.
- Resolución: 12 bits, referencia/rango configurado de 2,5 V.
- Valores iniciales: `R_shunt = 0,323 ohm`, `K = 1,0025189`.
- Conversión: `I = adc_raw * 2,5 * K / (4096 * R_shunt)`.

PA7 se conecta a la caída del shunt low-side, nunca al positivo de 12 V. Deben
existir masa común, limitación de tensión y una comprobación previa con
multímetro. La validación de rango del firmware no protege físicamente el pin.

`K` corrige la cadena completa de medida y no debe usarse para ocultar una
resistencia de shunt mal caracterizada. Registra temperatura, instrumento de
referencia y puntos de calibración si necesitas comparar sesiones con rigor.

## Formato de muestra

Cada trama binaria tiene ocho bytes:

| Offset | Tamaño | Campo |
|---:|---:|---|
| 0 | 2 | cabecera `A5 5A` |
| 2 | 4 | timestamp monotónico u32, little-endian, microsegundos |
| 6 | 2 | ADC crudo u16, little-endian |

La web desenvuelve el timestamp cuando cruza el límite u32. Conserva ADC y
timestamp antes de cualquier promedio.

## Comandos

| Comando | Efecto |
|---|---|
| `INFO` | versión, tasa, captura, drops y overflow |
| `RATE <Hz>` | fija 10-1000 Hz |
| `SYNC` | devuelve el reloj monotónico |
| `START` | inicia adquisición |
| `STOP` | detiene adquisición |

Los comandos terminan en LF; el firmware acepta CR. Sólo debe existir un comando
de control pendiente para no confundir respuestas ASCII y muestras binarias.

## BLE y USB-COM

BLE usa el servicio serie oficial del Flipper. Es cómodo, pero la tasa útil
depende del sistema operativo, latencia BLE y capacidad de vaciado del ring.
USB CDC1 ofrece más margen. CDC0 pertenece a CLI/qFlipper y no debe seleccionarse
como canal de adquisición.

`OVF` cuenta muestras o ticks que no pudieron conservarse por saturación de cola
o transporte. Retrasar cada envío no resuelve una producción sostenida mayor
que el consumo: sólo desplaza el punto de saturación. El timestamp permite
enviar con retardo y reordenar temporalmente, pero hace falta memoria suficiente
y una tasa media de salida igual o superior a la de entrada. Si `OVF` crece,
reduce RATE o usa CDC1.

`OOR` indica una lectura fuera del rango de corriente configurado. Debe tratarse
como posible problema eléctrico, no como simple defecto gráfico.

## Compilación e instalación

```powershell
cd flipper_fw\neq6_current_logger
ufbt update
ufbt
```

El FAP generado queda en `dist/`. La API del SDK debe coincidir con el firmware
del Flipper. Para instalación local usa qFlipper o uFBT; la aplicación web no
actualiza este FAP por BLE porque el logger ocupa el servicio serie y no expone
un cargador RPC seguro.

## Referencias internas

- [Montaje detallado](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/FLIPPER_SETUP.md)
- [Protocolo completo del logger](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/FLIPPER_PROTOCOL.md)
- [Firmware](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/tree/HEAD/flipper_fw/neq6_current_logger)
