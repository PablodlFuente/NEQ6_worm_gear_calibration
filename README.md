# NEQ6 - Ajuste Sinfín-Corona

Aplicación web para controlar los ejes de una montura SkyWatcher NEQ6/EQ6 y
medir la corriente del motor durante una o varias vueltas. Relaciona cada
muestra del ADC con el contador de posición `:j` de la controladora para localizar
excentricidad, rozamiento o zonas de carga irregular del conjunto sinfín-corona.

![Test de eje en ejecución](docs/images/test-en-ejecucion.png)

## Funciones principales

- Control de AR/RA y DEC mediante EQDirect y Web Serial a 9600 8N1.
- Movimiento manual por GOTO, jog continuo y parada normal o inmediata.
- Test automático de 1 a 10 vueltas en sentido CW o CCW.
- Carrerilla de 2° en sentido contrario antes de registrar.
- Posición y velocidad calculadas exclusivamente desde respuestas `:j`, no integrando el tiempo.
- Corriente instantánea e `I RMS` móvil de 0,5 s; shunt y factor K configurables (0,323 Ω y 1,0025189 por defecto).
- Flipper Zero por BLE o por su segundo puerto USB-COM.
- Gráficas en vivo, Polar, Cartesiano, FFT y estadísticas.
- Promedio por bloques con tamaño libre, barras SEM, elipse polar, zoom y pan.
- Exportación ZIP con CSV crudo/procesado, FFT, PNG y resumen JSON.
- Registro local JSONL de acciones, mensajes y tráfico serie.

## Requisitos

- Windows, Linux o macOS con Node.js 20 o posterior.
- Chrome o Edge de escritorio.
- Adaptador EQDirect/UART-USB para la montura.
- Flipper Zero con `NEQ6 Current`, o un logger ADC compatible.
- Shunt low-side correctamente dimensionado y masa común.

## Instalación

```powershell
git clone <URL-DEL-REPOSITORIO>
cd NEQ6_worm_gear_calibration
npm ci
npm run dev
```

Abre [http://127.0.0.1:3000](http://127.0.0.1:3000) en Chrome o Edge. El
servidor escucha también en la red local; no lo expongas a Internet sin añadir
autenticación y HTTPS.

Para comprobar la instalación:

```powershell
npm run check
```

## Preparar el Flipper Zero

1. Compila o instala la aplicación de `flipper_fw/neq6_current_logger`.
2. Conecta el shunt a PA7/A7 según [FLIPPER_SETUP.md](docs/FLIPPER_SETUP.md).
3. Ejecuta **NEQ6 Current** en el Flipper.
4. En **Ajustes → Conexión Flipper**, intenta primero BLE.
5. Si BLE falla, elige el segundo COM del Flipper (CDC1). CDC0 es qFlipper/CLI.
6. Pulsa `SYNC` si el estado no aparece como alineado.

## Primera medición

1. Libera el recorrido y comprueba cables, frenos y equilibrio.
2. En **Ajustes**, conecta la montura a 9600 8N1.
3. En **Montura**, ejecuta **Escanear montura**.
4. En **Test ejes**, selecciona AR/DEC, CW/CCW, vueltas, ADC y velocidad.
5. Empieza con 1 vuelta, 100 Hz y 0,2–0,5 °/s.
6. Pulsa **Iniciar test sincronizado**.

El eje se mueve primero 2° en el sentido opuesto mediante un GOTO corto. Después
invierte el sentido y usa velocidad continua estable; la adquisición comienza
cuando `:j` confirma el cruce por 0°. Al completar el recorrido observado se
detiene con `:K`. Una velocidad como 0,199°/s permanece en modo lento; el modo
rápido se reserva para velocidades que lo necesitan, hasta el límite nominal
de 800× sideral (unos 3,34°/s en la NEQ6).

La NEQ6 utiliza motores paso a paso sin encoder mecánico de salida: `:j` informa
de los pasos contabilizados por la controladora. Es una medida mucho mejor que
estimar ángulo por tiempo, pero no puede detectar por sí sola una pérdida física
de pasos si el motor llega a bloquearse.

## Resultados

![Análisis polar](docs/images/analisis-polar.png)

![Análisis cartesiano](docs/images/analisis-cartesiano.png)

- **Polar:** corriente frente a fase angular y ajuste final de elipse.
- **Cartesiano:** corriente frente a grados; con promedio muestra SEM en X/Y.
- **FFT básica:** cinco picos automáticos y picos manuales; convierte cada periodo a
  separación angular usando la velocidad medida.
- **Estadísticas:** corriente, ruido, tasa efectiva, muestras por grado,
  recorrido confirmado, velocidad real y parámetros de la elipse.

## Logs y privacidad

`npm run dev` crea `logs/AAAA-MM-DD.jsonl`. Se registran acciones de botones y
selectores, mensajes, comandos y respuestas serie, con hora del navegador, hora
del servidor, `User-Agent` e IP observada por el servidor.

- En el mismo PC la IP será normalmente `127.0.0.1` o `::1`.
- Desde otro equipo será normalmente su IP de la red local.
- No se consulta ningún servicio externo para obtener la IP pública.
- `logs/` está en `.gitignore`: revisa su contenido antes de compartirlo.

## Seguridad

PA7 no admite los 12 V de la montura. El shunt debe ir en low-side y la tensión
del ADC debe permanecer dentro del rango permitido. Mantén accesible la parada
física. Los comandos rojos piden confirmación; `L1` y `L2` se ejecutan sin ella
porque son paradas inmediatas.

## Documentación

- [Guía detallada / Wiki](wiki/Home.md)
- [Procedimiento de calibración](docs/TEST_PROCEDURE.md)
- [Montaje y firmware del Flipper](docs/FLIPPER_SETUP.md)
- [Protocolo del logger](docs/FLIPPER_PROTOCOL.md)
- [Resolución de problemas](docs/TROUBLESHOOTING.md)
- [Índice documental](docs/README.md)

## Estado del proyecto

El sistema es funcional, pero cualquier cambio de movimiento debe validarse
primero sin carga y con recorrido corto. El Flipper es el logger actual; puede
sustituirse por un ADC/microcontrolador USB-COM compatible.
