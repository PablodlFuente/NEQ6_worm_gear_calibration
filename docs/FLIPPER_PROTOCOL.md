# Protocolo del logger

El protocolo es idéntico sobre BLE Serial y USB CDC1. Los comandos terminan en
LF; el firmware también acepta CR.

## Comandos ASCII

| Comando | Respuesta | Función |
|---|---|---|
| `START` | `OK` | Inicia el muestreo a la tasa vigente. |
| `STOP` | `OK` | Detiene el timer de muestreo. |
| `RATE <hz>` | `OK` o `ERR rate 10-1000` | Configura 10–1000 Hz. |
| `SYNC` | `SYNC <us>` | Timestamp monotónico u32 del Flipper. |
| `INFO` | `INFO v3.1 ...` | Tasa solicitada/real, estado y contadores. |

La web mantiene un único comando ASCII en vuelo. Las respuestas se multiplexan
con las muestras binarias y no se interpretan bytes de payload como texto.

## Trama de muestra

Longitud fija de 8 bytes:

| Offset | Tamaño | Contenido |
|---:|---:|---|
| 0 | 1 | `0xA5` |
| 1 | 1 | `0x5A` |
| 2 | 4 | `timestamp_us`, u32 little-endian |
| 6 | 2 | `adc_raw`, u16 little-endian |

El timestamp u32 se desenvuelve en la web al cruzar su límite natural de unos
71,6 minutos. El contador interno del firmware acumula los ciclos DWT para que
el wrap físico corto de CYCCNT no introduzca discontinuidades.

## Conversión y contadores

La conversión reproducible de la web es:

```text
I [A] = adc_raw × 2.5 × K / 4096 / R_shunt
```

Los valores iniciales son `K=1.0025189` y `R_shunt=0.323 Ω`, pero ambos se
pueden cambiar en Ajustes. La web los conserva en cada sesión y CSV.

`oor` cuenta adquisiciones rechazadas por estar fuera de 0–2,5 A según la
conversión oficial HAL calibrada. `ovf` cuenta ticks o muestras perdidos porque
la cola/ring estaba llena. `n` cuenta muestras válidas incorporadas al ring.

El CSV procesado incluye `amps_sem`, `angle_sem_deg` y `n_group`. Al volver a
importarlo se restauran también los ángulos, por lo que las vistas Polar y
Cartesiano se pueden reconstruir sin la montura conectada.

Los CSV crudo y procesado incluyen comentarios `axis`, `direction` y
`origin_steps`. La sesión IndexedDB y `resumen.json` conservan los mismos
metadatos para reconstruir un ángulo relativo como posición absoluta `:j`.

## Sincronización

Para cada `SYNC`, la web registra el instante de envío y recepción. Estima la
hora del navegador en el punto medio del RTT, repite seis veces y usa la mediana
del desfase. El jitter mostrado es la mediana de las desviaciones absolutas. La
hora de adquisición queda:

```text
browser_ms = flipper_us / 1000 - offset_ms
```
