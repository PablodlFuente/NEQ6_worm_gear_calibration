# Wiki - NEQ6 Ajuste Sinfín-Corona

Esta wiki explica la instalación, conexión, ejecución y análisis del programa.

![Test en ejecución](images/test-en-ejecucion.png)

## Contenido

- [Instalación](Instalacion.md)
- [Uso y seguridad](Uso-y-seguridad.md)
- [Flipper Zero](Flipper-Zero.md)
- [Análisis de datos](Analisis-de-datos.md)
- [Registro y diagnóstico](Registro-y-diagnostico.md)

## Qué mide realmente

El ADC mide la caída sobre el shunt y la web la convierte a amperios. La
posición no se estima integrando la velocidad: procede de consultas `:j` a la
montura y se interpola temporalmente entre anclas reales.

La secuencia automática retrocede 2° en sentido contrario, comienza el GOTO
CW/CCW seleccionado y activa el ADC al recuperar esos 2°. Al finalizar exige al
menos el 99,5 % del recorrido pedido según feedback.
