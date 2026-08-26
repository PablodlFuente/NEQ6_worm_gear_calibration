# Flipper Zero: preparación y conexión

## Cableado

Configuración aplicada por el firmware:

- Entrada: `PA7`, GPIO físico pin 2.
- ADC: escala 2500 mV, reloj Sync64, sin oversampling, muestreo 247,5 ciclos,
  resolución de 12 bits.
- Valores iniciales de conversión web: `K = 1.0025189`, `R = 0.323 Ω`.
  Se pueden cambiar en Ajustes y quedan asociados a la sesión/exportación.
- Rango de corriente aceptado: 0–2,5 A.

Usa el shunt en el retorno low-side de la alimentación y une las masas del
Flipper y de la montura. PA7 se conecta a la caída del shunt, nunca directamente
al positivo de 12 V. La validación de software no protege el pin frente a
sobretensión: añade fusible/protección y verifica primero con multímetro.

## Compilar

Desde `flipper_fw/neq6_current_logger`:

```powershell
ufbt update
ufbt
```

En este workspace también existe un entorno local reproducible:

```powershell
..\..\.tools\ufbt-venv\Scripts\ufbt.exe
```

El SDK debe ser compatible con la versión instalada en el Flipper. El FAP se
genera en `dist/neq6_current_logger.fap`. La interfaz web permite descargar las
fuentes como ZIP desde **Ajustes**.

El repositorio incluye en `release/neq6_current_logger-momentum-api87.1.fap` el
binario v3.1 compilado para Momentum API 87.1 (SHA-256
`D9FC952EE73E8CB8691D6346D889F3C6E8B6AAB4C59714C3B84C6CC2143990E4`). Para
otra versión/API del sistema, recompila el FAP desde las fuentes.

La versión v3.1 usa un umbral ADC crudo equivalente para OOR y evita la
conversión de voltaje HAL dentro del bucle de muestreo. Esta corrección es
necesaria para acercarse a 1000 Hz; la web muestra siempre la tasa efectiva y
el contador OVF para verificar el resultado real.

## Instalar y ejecutar

Con qFlipper, copia el FAP a `SD Card/apps/Tools` y ejecútalo desde el Flipper.
Con uFBT se puede usar `ufbt launch`. Al activar USB dual CDC, Windows vuelve a
enumerar el dispositivo; por eso `ufbt launch` puede terminar con
`ClearCommError` aunque la aplicación ya esté instalada y en marcha.

La pantalla debe mostrar `NEQ6 Current`, la frecuencia, `IDLE/REC`, el número de
muestras y los contadores `OOR/OVF`.

## BLE preferente

1. Activa Bluetooth en Windows y en el Flipper.
2. Ejecuta `NEQ6 Current`.
3. En la web abre **Ajustes → Escanear BLE** y elige el Flipper.
4. Espera a que aparezca `ALINEADO`; la aplicación hace seis intercambios SYNC.


## Alternativa USB-COM

Al ejecutarse el logger aparecen dos interfaces:

- CDC0: CLI/qFlipper.
- CDC1: adquisición NEQ6 a 115200 8N1.

Pulsa **Elegir puerto COM del Flipper** y selecciona el COM adicional. El número
puede cambiar entre conexiones; no se debe codificar `COM5` ni otro valor fijo.
No abras BLE y CDC1 al mismo tiempo.

## Comprobación rápida

Conectado desde la web, pulsa `SYNC` y confirma que hay RTT/jitter. Al iniciar un
test, `REC` debe aparecer en la pantalla y crecer `Samples`. `OOR` indica una
muestra fuera del rango calibrado; `OVF` indica pérdida por cola o transporte.
