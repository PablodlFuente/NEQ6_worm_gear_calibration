# Diagnóstico de problemas

## BLE no encuentra o no conecta el Flipper

- Comprueba que `NEQ6 Current` está abierta; el perfil se inicia dentro del FAP.
- Cierra qFlipper/RPC si retiene la conexión Bluetooth.
- En Windows elimina un emparejamiento antiguo del Flipper y vuelve a intentar.
- Elige el propio Flipper en el selector, aunque el servicio no aparezca en el
  anuncio. La web solicita después el servicio serie correcto por UUID.
- Usa Chrome/Edge en `localhost` o HTTPS. Web Bluetooth no funciona en un
  contexto inseguro ni en navegadores sin esa API.
- Si conecta pero SYNC expira, mira la pantalla del Flipper y reinicia el FAP.

## USB-COM no aparece

- El segundo COM solo existe mientras `NEQ6 Current` está ejecutándose.
- Espera unos segundos después de abrir el FAP: Windows reenumera USB.
- CDC0 pertenece a CLI/qFlipper; selecciona CDC1, el COM nuevo.
- Cierra terminales que mantengan abierto el segundo puerto.
- Si BLE está conectado, desconéctalo antes de abrir COM.

## La montura no conecta

- Usa EQDirect, 9600 8N1 y terminación CR.
- Asegura alimentación de 12 V y masa común del adaptador.
- Cierra ASCOM, EQMOD, Stellarium u otra aplicación que use el mismo COM.
- Ejecuta **Escanear montura** y revisa el monitor serie. `!4` al arrancar un
  movimiento indica falta de referencia; la aplicación intenta `:F` una vez.

## El test no se habilita

Se necesitan simultáneamente: COM de montura abierto, CPR detectado, Flipper
conectado, reloj alineado, ningún movimiento/diagnóstico activo, revoluciones
enteras entre 1 y 10 y velocidad entre 0,01 y 5 °/s.

## Hay `OOR` o `OVF`

- `OOR`: la conversión HAL da una corriente fuera de 0–2,5 A. Detén el test y
  revisa caída del shunt, ganancia, masa y rango; no es solo un aviso gráfico.
- `OVF`: reduce el muestreo, mejora el enlace o usa USB-COM. En BLE, empieza por
  100–250 Hz antes de intentar 500–1000 Hz.

## La curva no tiene ángulo

El ángulo requiere consultas `:j` válidas durante el movimiento y una SYNC
válida. Revisa el monitor de la montura, CPR y que no exista otro consumidor del
COM. Los datos de corriente siguen siendo exportables aunque falle la posición.

## Verificación de software

```powershell
npm ci
npm run check
cd flipper_fw\neq6_current_logger
..\..\.tools\ufbt-venv\Scripts\ufbt.exe
```

