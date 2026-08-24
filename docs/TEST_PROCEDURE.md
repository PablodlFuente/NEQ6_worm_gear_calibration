# Procedimiento de calibración del worm-gear

## Antes de energizar

1. Inspecciona el shunt, masa común, aislamiento y polaridad con la montura sin
   alimentación.
2. Comprueba que PA7 nunca pueda recibir la línea de 12 V.
3. Equilibra el tubo y contrapesos. Verifica que una vuelta del eje no alcance
   un tope ni enrolle alimentación, USB, cámaras o calefactores.
4. Ten al alcance la parada física de la montura. La parada web es una segunda
   barrera, no sustituye cortar la alimentación.

## Preparar el sistema

1. Ejecuta `npm run dev` y abre la URL local en Chrome/Edge.
2. Conecta la montura en **Ajustes** a 9600, 8 bits, sin paridad, 1 stop.
3. Ejecuta **Escanear montura**. Deben aparecer CPR, timer y ratio de ambos ejes.
4. Ejecuta `NEQ6 Current` en el Flipper y conecta BLE o el segundo USB-COM.
5. Espera a `ALINEADO`. Si no aparece, pulsa `SYNC`.
6. Con el motor quieto, observa que la corriente sea plausible y que `OOR/OVF`
   permanezcan en cero.

## Primera ejecución recomendada

Haz primero un test corto/manual de movimiento sin instrumentación para validar
el sentido y la holgura. Para la primera captura automática usa:

- 1 revolución.
- 100 Hz de ADC.
- 0,5 °/s.
- El eje con menor riesgo de cables o colisión.

En **Test ejes**, el panel derecho contiene únicamente eje, vueltas, muestreo,
velocidad, progreso, inicio y parada. Al pulsar inicio se borra la vista actual,
se inicia el ADC y después el movimiento. La gráfica de la izquierda crece
durante la adquisición.

Pulsa **Parada de emergencia** ante ruido anormal, atasco, aumento brusco de
corriente o riesgo de cable. El motor recibe `:L` y el logger recibe `STOP`; el
registro parcial se conserva para diagnóstico.

## Interpretación

- Un patrón repetido a igual ángulo entre vueltas sugiere excentricidad,
  engrane irregular o variación periódica de precarga.
- Un nivel general más alto en un sentido puede indicar desequilibrio.
- Picos aislados pueden ser cables, suciedad, golpes o errores de transporte;
  comprueba `OVF` y repite antes de ajustar mecánica.
- Ajusta el worm-gear en incrementos pequeños, repite con la misma velocidad y
  compara sesiones crudas. No ajustes basándote solo en datos promediados.

Exporta siempre el CSV crudo antes de una intervención mecánica importante.

