# Formato de datos y exportación

## Principio

El CSV de medidas contiene una fila por conversión real del ADC y nunca se
altera. La exportación añade, por separado, los datos promediados que corresponden
al tamaño de bloque seleccionado en pantalla. Así se conserva tanto la evidencia
primaria como la vista numérica usada en las gráficas.

## CSV de medidas

```text
t_us,timestamp,adc_raw,amps_raw,angle,rev
```

| Columna | Unidad | Significado |
|---|---|---|
| `t_us` | us | reloj monotónico del logger, desenvuelto |
| `timestamp` | ISO 8601 UTC | instante sincronizado en el navegador |
| `adc_raw` | cuentas | conversión ADC original sin agrupar |
| `amps_raw` | A | corriente calculada con R y K de la sesión |
| `angle` | grados | fase normalizada `[0, 360)`; vacía sin posición |
| `rev` | entero | revolución desde 1; vacía sin movimiento |

La cabecera comentada identifica test, eje, sentido, calibración y define cada
campo. No expone nombres internos del protocolo de la montura.

## CSV de datos promediados

El test básico exporta `datos-promediados/promedios.csv`. Además de la media de
corriente y ángulo incluye:

- `amps_std` y `angle_std_deg`: desviación típica muestral dentro del bloque;
- `amps_sem` y `angle_sem_deg`: incertidumbre estándar de la media;
- `n_group`: número real de muestras del bloque.

El test extendido crea un CSV por pasada móvil y
`promedio-series.csv`, que agrega cada sector angular entre las series. La fase
de ruido no se fuerza a tener ángulo y por ello no genera una curva ni un CSV
angular.

## Estructura ZIP

Un test básico genera una raíz similar a:

```text
NEQ6_AR_test-basico_2026-08-25-19-30-00/
  medidas/medidas.csv
  datos-promediados/promedios.csv
  fft/espectro.csv
  fft/fft-picos.csv
  graficas/corriente-tiempo.png
  graficas/polar-elipse.png
  graficas/cartesiana.png
  graficas/fft.png
  resumen-estadisticas-y-fft.txt
```

Un test extendido añade un CSV y un espectro por pasada, espectros separados por
revolución cuando existen, un espectro promedio y el análisis comparativo:

```text
medidas/noise-medidas.csv
medidas/fast-cw-medidas.csv
datos-promediados/fast-cw.csv
datos-promediados/promedio-series.csv
fft/espectro-fast-cw.csv
fft/revoluciones/fast-cw-rev-1.csv
fft/espectro-promedio.csv
fft/analisis-comparativo.csv
resumen-estadisticas-y-fft.txt
```

El promedio FFT se interpola sobre el eje común más conservador y excluye la
fase de ruido estacionario. Esta fase sí se exporta individualmente y participa
en la clasificación de picos eléctricos o de muestreo.

El resumen TXT está pensado para lectura humana: identifica test, eje,
calibración y promedio, presenta las estadísticas por fase y separa las
frecuencias clasificadas como mecánicas o tren motor del inventario FFT completo.
No sustituye a los CSV cuando se necesita recalcular.

## Sesiones locales

**Guardar sesión** usa IndexedDB del navegador y conserva buffers, calibración,
metadatos y análisis extendido. No es una copia de seguridad independiente: el
perfil del navegador puede borrarse. **Exportar todas las sesiones** crea un ZIP
con una carpeta identificada por sesión, eje y tipo.

Las sesiones creadas antes de almacenar espectros completos siguen siendo
cargables, pero no pueden reconstruir información que nunca se guardó.

## Importación

La importación reconoce el CSV actual y formatos históricos. Al importar
muestras sin ángulo se recuperan Vivo y FFT, pero no Polar, Cartesiano ni
estadística circular. El timestamp ISO se convierte de nuevo a la escala
temporal del navegador.

## Reproducibilidad

Para comparar dos ajustes usa el CSV individual, no una captura de pantalla.
Conserva versión de firmware, R, K, eje, sentido, velocidad y carga. La imagen
es una representación; el CSV es la evidencia numérica primaria.
