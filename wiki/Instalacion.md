# Instalación

## Software

1. Instala Node.js 20 o posterior.
2. Clona el repositorio.
3. Ejecuta `npm ci`.
4. Ejecuta `npm run dev`.
5. Abre `http://127.0.0.1:3000` en Chrome o Edge.

`npm run check` ejecuta tipos, pruebas y build.

## Hardware

- Montura NEQ6/EQ6 y alimentación adecuada.
- Cable EQDirect/UART-USB, 9600 8N1.
- Flipper Zero con `NEQ6 Current`, o logger compatible.
- Shunt de 0,323 Ω según la calibración actual.

## Conexiones

La montura y el logger son enlaces distintos. Selecciona EQDirect para la
montura. Para el Flipper prueba BLE o CDC1; CDC0 suele pertenecer a qFlipper.
Después ejecuta **Escanear montura** y sincroniza el logger.
