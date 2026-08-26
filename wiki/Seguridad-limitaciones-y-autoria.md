# Seguridad, limitaciones y autoría

## Riesgos

Este software puede ordenar movimiento directo a la placa de motores y adquirir
una señal conectada eléctricamente a una montura de 12 V. Un error de cableado,
configuración, firmware o interpretación puede dañar el Flipper, la montura, el
telescopio, accesorios o causar lesiones.

Medidas mínimas:

- no conectar PA7 al positivo de 12 V;
- dimensionar shunt, disipación, fusible y protección de entrada;
- probar primero sin carga y con desplazamientos cortos;
- mantener libres topes y cables;
- disponer de corte físico de alimentación;
- no usar comandos de EEPROM, registro o bootloader sin documentación y medios
  de recuperación.

La parada web depende del navegador, USB/BLE, sistema operativo, EQDirect y
controladora. No es una función de seguridad certificada.

## Limitaciones metrológicas

- El ADC y el shunt requieren calibración trazable para obtener exactitud.
- La posición es el contador de la controladora, no un encoder de salida.
- La interpolación temporal presupone movimiento razonablemente continuo entre
  anclas.
- El SEM no incluye errores sistemáticos ni autocorrelación.
- La FFT depende de duración, tasa efectiva, ventana y ancho de banda físico.
- La corriente es un indicador indirecto de carga, no una medida de par.
- La elipse polar es un descriptor estadístico de la nube, no un modelo físico
  de la corona.

## Disclaimer

En la medida máxima permitida por la ley aplicable, el software y la
documentación se proporcionan “tal cual”, sin garantías expresas ni implícitas.
El autor no será responsable de daños directos, indirectos, incidentales,
especiales, consecuentes o de cualquier otra naturaleza derivados del uso,
incapacidad de uso, cableado, movimiento, modificación o interpretación de los
resultados. El usuario asume la evaluación de riesgos y la responsabilidad de
operar el equipo con seguridad.

Este texto resume el aviso; los términos jurídicos aplicables están en
[`LICENSE`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/LICENSE)
y [`NOTICE.md`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/NOTICE.md).

## Licencia

GNU Affero General Public License v3.0 (`AGPL-3.0-only`) permite uso, estudio,
modificación, distribución y uso comercial. Toda copia o derivado debe
conservar la licencia, los avisos de copyright y la referencia a Pablo de la
Fuente y al proyecto original. Las versiones modificadas que interactúen con
usuarios a través de una red deben ofrecerles el código fuente correspondiente.
La documentación usa la misma licencia salvo que un archivo indique lo
contrario.

## Autoría y asistencia

Proyecto original: **Pablo de la Fuente**

Repositorio: <https://github.com/PablodlFuente/NEQ6_worm_gear_calibration>

La programación, revisión y documentación han sido asistidas por **OpenAI
Codex**.
