# Registro y diagnóstico

## Logs automáticos

Con `npm run dev`, cada sesión escribe `logs/AAAA-MM-DD.jsonl`. Cada línea lleva
hora del cliente y servidor, IP observada, navegador, acción, mensajes y tráfico
TX/RX. La carpeta está ignorada por Git y no se consulta la IP pública.

## Motor lento o bloqueado

1. Detén el test y corta alimentación si hay vibración o pérdida de par.
2. Comprueba en el log la secuencia `:G`, `:H/:S`, `:M`, `:J`.
3. Verifica CPR, timer y ratio detectados.
4. Compara velocidad programada y velocidad medida `:j`.
5. Repite pocos grados sin carga.

La vuelta usa GOTO rápido y `:M=3200`; la carrerilla usa modo lento y `:M=200`.
El valor EQMOD “800” suele ser velocidad sideral multiplicada: 800× equivale
aproximadamente a 3,34 °/s, no a 800 °/s.

## ADC

Compara tasa solicitada y efectiva y revisa `OVF`. A 1000 Hz BLE puede perder
rendimiento; USB-COM suele ofrecer más margen.
