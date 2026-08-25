# Referencias

## Protocolo de montura

**[R1]** Sky-Watcher / EQ6, *Protocolo serial SkyWatcher / EQ6 - referencia
técnica de comandos, tramas, estados y flujo de comunicación*. Documento
incluido en el repositorio. El framing y la codificación están en pp. 2-3; los
modos y secuencias de movimiento en pp. 4-5; velocidad y offset de posición en
p. 7; el enlace transaccional y checklist en pp. 9-10; el addendum corrige el
estado y los errores en pp. 12-13.

<https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/SkyWatcher_EQ6_Protocolo_Completo_Referenciado_FINAL.pdf>

**[R2]** INDI, `skywatcherAPI.h`: enumeración de comandos, estado y parámetros
de eje.

<https://github.com/indilib/indi/blob/master/drivers/telescope/skywatcherAPI.h>

**[R3]** INDI, `skywatcherAPI.cpp`: serialización, `TalkWithAxis`,
inicialización, `Slew`, `SlewTo`, `Stop` y consultas.

<https://github.com/indilib/indi/blob/master/drivers/telescope/skywatcherAPI.cpp>

**[R4]** INDI, `skywatcherAPIMount.cpp`: integración de la API con operaciones
de montura.

<https://github.com/indilib/indi/blob/master/drivers/telescope/skywatcherAPIMount.cpp>

## Proyecto

- [Procedimiento de calibración](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/TEST_PROCEDURE.md)
- [Montaje y firmware del Flipper](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/FLIPPER_SETUP.md)
- [Protocolo del logger](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/FLIPPER_PROTOCOL.md)
- [Diagnóstico](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/docs/TROUBLESHOOTING.md)
- [Pruebas automatizadas](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/tree/HEAD/tests)

## Licencia y plataforma

- [GNU Affero General Public License v3.0](https://www.gnu.org/licenses/agpl-3.0.html)
- [GitHub Docs: documentación con wikis](https://docs.github.com/en/communities/documenting-your-project-with-wikis)

## Convención de evidencia

Las referencias de protocolo describen qué solicita la placa y cómo responde.
Los resultados de una montura concreta deben apoyarse además en su tráfico
registrado y en medición física. Cuando el documento Sky-Watcher y una
implementación de terceros difieran, la wiki lo trata como una discrepancia que
debe resolverse con firmware y tráfico reales, no por autoridad aparente.
