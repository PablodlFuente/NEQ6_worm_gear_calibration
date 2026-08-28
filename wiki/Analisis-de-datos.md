# Análisis de datos

## Antes de interpretar

La corriente del motor es una variable indirecta del esfuerzo. También depende
de tensión de alimentación, estrategia del driver, velocidad, aceleración,
temperatura, equilibrado y fricción externa. Ninguna gráfica identifica por sí
sola un defecto de sinfín o corona.

## Vista polar

![Gráfica polar](images/analisis-polar.png)

La fase angular es el argumento y la corriente es el radio. Esta proyección
hace visibles patrones ligados a la posición y permite comparar revoluciones
sin discontinuidad en 0/360°.

- El círculo naranja punteado representa la corriente media global.
- El radio azul punteado representa la dirección circular ponderada.
- Las zonas sombreadas cubren intervalos continuos donde una media angular
  suavizada supera la media global.
- Cada revolución o pasada extendida mantiene su color.
- La línea blanca semitransparente es el perfil promedio de las series visibles.

Las zonas no están restringidas a sectores rígidos de 10°: su anchura responde
al intervalo continuo detectado. Un área extensa ligeramente elevada y un pico
estrecho pueden tener implicaciones diferentes y deben compararse con la señal
sin promediar.

## Vista cartesiana

![Gráfica cartesiana](images/analisis-cartesiano.png)

Representa fase en X y corriente en Y. Es la vista apropiada para medir anchura,
pendiente, posición del máximo y diferencias entre sentidos.

Con `promedio x 1` se representa cada muestra posicionada. Con `x N` se forman
bloques temporales consecutivos completos de N muestras. Para N > 1:

```text
SEM_y = s_corriente / sqrt(N)
SEM_x = s_angulo / sqrt(N)
```

Las barras X/Y son errores estándar dentro del bloque, no exactitud absoluta ni
incertidumbre completa del sistema. El último bloque incompleto no se publica
hasta disponer de N muestras.

## Estadística básica

- **N:** muestras consideradas.
- **Media:** nivel medio, sensible a picos.
- **Mediana:** nivel central robusto frente a valores extremos aislados.
- **Desviación estándar `s`:** dispersión individual alrededor de la media.
- **SEM:** `s/sqrt(N)`; precisión estadística de la media bajo supuestos de
  independencia. En una señal autocorrelacionada suele ser optimista.
- **Máximo y posición:** extremo observado y fase interpolada asociada.
- **I RMS:** raíz de la media cuadrática en una ventana móvil de 0,5 s; sirve
  para comparar una lectura suavizada con instrumentos de respuesta lenta.

En el test básico, cambiar el bloque modifica la serie derivada mostrada. En el
extendido, cada pasada conserva estadísticas capturadas y el resumen expresa la
variabilidad entre pasadas mediante `media ± incertidumbre estándar`.

## Estadística circular

Para cada muestra angular `theta_i` con corriente no negativa `w_i`, se calcula:

```text
C = sum(w_i cos(theta_i)) / sum(w_i)
S = sum(w_i sin(theta_i)) / sum(w_i)
angulo_medio = atan2(S, C)
R = sqrt(C² + S²)
```

`R` es la concentración resultante:

- `R` próxima a 1: la carga ponderada se concentra en una dirección.
- `R` próxima a 0: distribución casi uniforme o contribuciones opuestas que se
  cancelan.

El ángulo medio sólo es interpretable junto a `R`. Una dirección numérica con
`R` muy baja no constituye una zona dominante. Como los pesos son corrientes
absolutas, un gran componente DC reduce la sensibilidad relativa a pequeñas
modulaciones; conviene contrastar con el perfil respecto a la media.

La desviación circular se deriva de `sqrt(-2 ln R)` y se expresa en grados. No
es equivalente a la desviación lineal cuando la distribución es multimodal.

## Ajuste elíptico

El perfil polar se transforma a una nube cartesiana:

```text
x = I sin(theta)
y = -I cos(theta)
```

Se calcula el centroide y los autovectores de la matriz de covarianza (PCA). Los
semiejes se obtienen de las dos varianzas principales. Se presentan:

- centro `(Cx, Cy)` en amperios;
- semiejes `a` y `b`;
- relación `a/b`;
- inclinación del eje principal, módulo 180°;
- excentricidad geométrica `sqrt(1 - b²/a²)`;
- residuo RMS normalizado.

No es un ajuste mecánico directo de la corona ni una demostración de
excentricidad física. Resume anisotropía de la nube de corriente. El centro
desplazado, `a/b` y el residuo permiten comparar sesiones tomadas bajo las
mismas condiciones.

## FFT

La corriente se interpola sobre una rejilla temporal uniforme y se aplica una
ventana de Hann antes de la FFT. Las capturas largas se calculan mediante
Welch con solapamiento, sin reducir toda la adquisición a 4096 puntos. Para una
duración `T`:

```text
resolucion_frecuencia = 1 / T                 (FFT de la captura completa)
resolucion_frecuencia = f_ADC / N_segmento    (Welch)
periodo_s = 1 / frecuencia_hz
periodicidad_angular = periodo_s * velocidad_medida_deg_s
```

La frecuencia máxima mostrada nunca supera el Nyquist de la tasa ADC efectiva,
`f_N = f_ADC/2`. La respuesta analógica de la entrada puede imponer un límite
práctico inferior.

Cada frecuencia se presenta con una incertidumbre de cuantización de medio bin,
`±Δf/2`. Al comparar pasadas, dos máximos son compatibles si se solapan sus
intervalos de resolución, aunque sus centros caigan en bins vecinos. Una
separación mayor puede proceder de deriva entre relojes, variación real de la
velocidad o falta de estacionariedad de la señal.

En un test básico se muestran cinco máximos automáticos y selecciones manuales.
En el extendido se puede seleccionar una pasada, el promedio o superponer todos
los espectros. También se conservan hasta 40 máximos locales por pasada para el
análisis comparativo.

En la comparación multipasada, cada señal móvil se reconstruye primero en el
dominio angular usando el feedback de posición y se refiere a la velocidad
media del conjunto. Los rasgos mecánicos aparecen así en el mismo bin aunque
cambien ligeramente la velocidad o la relación entre el reloj ADC y el reloj
del controlador. La FFT marcada como **Promedio** se calcula sobre la corriente
promedio de esas señales alineadas, no promediando sus espectros. La captura de
ruido estacionario conserva necesariamente su eje temporal original.

## Revoluciones superpuestas o independientes

La opción **revs. independientes** cambia el dominio de cálculo, no sólo la
apariencia de la gráfica:

- Activada: las revoluciones se consideran independientes y se superponen en
  `0–360°`. El perfil blanco y las estadísticas comparan las vueltas. La FFT
  promedio alinea los espectros en ciclos/grado y los devuelve a Hz con la
  velocidad media, sin perder la banda temporal original.
- Desactivada: las vueltas forman una serie continua en intervalos consecutivos
  (`0–360°`, `360–720°`, etc.). La línea blanca es la media móvil de la
  adquisición concatenada; sus estadísticas y FFT usan la serie completa.

La segunda opción proporciona mayor resolución frecuencial por su mayor tiempo
de observación; la primera facilita valorar la repetibilidad angular entre
vueltas. Los espectros individuales siguen disponibles para comprobar deriva
temporal. La interfaz identifica el modo activo en FFT y Estadísticas. El
selector sólo aparece en tests básicos con dos o más revoluciones.

### Clasificación comparativa

- Periodicidad en grados estable al cambiar velocidad: indicio ligado a
  posición o mecánica.
- Frecuencia en Hz estable pese al cambio de velocidad: indicio eléctrico,
  ADC, transporte o interferencia temporal.
- Frecuencia proporcional a la velocidad: posible tren motor/transmisión.
- Presencia con motores parados: refuerza origen eléctrico o de muestreo.
- Relación cercana a `2f`, `3f`, etc.: posible armónico de una fundamental.

La clasificación usa tolerancias de coincidencia y es orientativa. Un pico puede
tener varios orígenes y una componente mecánica puede excitar una resonancia
eléctrica o estructural.

## Análisis IA (opcional)

![Análisis IA integrado](images/analisis-ia.png)

Al analizar, la aplicación entrega al proveedor (tres por defecto pero se pueden configurar más) un resumen de la adquisición,
las estadísticas y los picos espectrales; cuando el proveedor lo admite,
adjunta también los datos. El informe pide tres apartados breves: resultados,
causas más probables y riesgo. No presupone un defecto concreto: debe valorar
alineación y flexión de ejes, rodamientos, transmisión, motor/driver,
electrónica y artefactos de adquisición. También puede relacionar
periodicidades con relaciones de transmisión conocidas, diferenciando una
coincidencia documentada de una inferencia.

El resultado es una hipótesis de trabajo y no sustituye la repetición del
ensayo ni la inspección mecánica o eléctrica independiente. Se conserva con la
sesión y se incluye en su exportación si esta función está activada.

## Comparación correcta de sesiones

1. Mantén carga, equilibrado, sentido, velocidad, tasa y calibración.
2. Comprueba tasa efectiva y `OVF` antes de comparar amplitudes.
3. Compara primero periodicidad y fase; después amplitud.
4. Exige repetición entre vueltas y ensayos independientes.
5. Usa CSV y espectros exportados, no sólo capturas de pantalla.

## Implementación

Los cálculos están en [`src/lib/flipper.ts`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/src/lib/flipper.ts)
y su representación en [`src/components/FlipperLab.tsx`](https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/blob/HEAD/src/components/FlipperLab.tsx).
