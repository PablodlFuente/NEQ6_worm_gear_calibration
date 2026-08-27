# Análisis IA

Esta función es opcional y permanece desactivada por defecto. Envía el resumen numérico del ensayo a la interfaz web de un chat mediante un navegador local automatizado; la aplicación no incorpora claves API. También intenta adjuntar un CSV con las muestras angulares y los picos espectrales. Si el chat no expone una entrada de archivos, continúa únicamente con el resumen textual. La respuesta se conserva en el navegador junto a la huella del informe y se incluye en la exportación de la sesión.

El informe solicita tres apartados breves: análisis de resultados, causas más probables y análisis de riesgo. El contexto no presupone un defecto concreto: pide contrastar ejes y alineación, rodamientos, transmisión, motor y driver, electrónica y posibles artefactos de adquisición. Sigue siendo una hipótesis auxiliar que debe contrastarse con las medidas y una inspección independiente.

## Configurar un proveedor

En **Ajustes → Análisis IA**, activa el interruptor y pulsa el lápiz para editar un proveedor existente o **Añadir IA** para crear otro. Los cambios se guardan en `localStorage`.

Cada adaptador contiene:

- **URL del chat**: página HTTPS que abre el navegador automatizado.
- **Selector de entrada**: selector CSS del `textarea` o elemento `contenteditable` donde se escribe el informe.
- **Selector de envío**: selector CSS del botón que envía el mensaje.
- **Selector de respuesta**: selector CSS común a las respuestas del modelo; se toma la última coincidencia nueva.
- **Selector de generación**: selector opcional del botón de parada que sólo está visible mientras se genera. Evita dar por terminada una respuesta incompleta.

Los proveedores incluidos sirven como ejemplos editables. Si el proveedor cambia su DOM, basta con corregir sus selectores; no es necesario modificar el programa.

## Obtener los selectores

1. Abre el chat y las herramientas de desarrollo del navegador (`F12`).
2. Usa el inspector para seleccionar el editor, el botón de envío y una respuesta completa.
3. Busca atributos estables (`id`, `data-testid`, `aria-label` o una clase específica). Evita cadenas de clases generadas y rutas basadas en `nth-child`.
4. Prueba el selector en la consola con `document.querySelectorAll("selector")`. La entrada y el botón deberían producir una coincidencia visible; el selector de respuesta puede producir una por turno.
5. Si la interfaz tiene varios idiomas, pueden combinarse alternativas separadas por comas.

Ejemplo de entrada:

```css
textarea.message-input-textarea, textarea[placeholder*='Qwen']
```

Ejemplo de envío:

```css
button.send-button, button[aria-label='Enviar'], button[aria-label='Send']
```

## Ejecución y limitaciones

**Analizar** procesa el proveedor seleccionado. **Analizar con todas** lanza el mismo informe contra todos los adaptadores y almacena cada respuesta por separado. Volver a seleccionar una IA recupera su respuesta guardada; pulsar **Analizar** genera otra.

Cuando la función está activada, **Guardar sesión** incorpora las respuestas
disponibles y su huella de datos a la sesión de IndexedDB. Al volver a cargarla
se restauran los informes de sus proveedores. **Exportar (.zip)** añade cada
respuesta como `analisis-ia/<proveedor>.txt`; la exportación conjunta hace lo
mismo para cada sesión guardada. Con el interruptor en `OFF` no se adjuntan ni
restauran informes de IA.

Chrome se ejecuta fuera del escritorio visible y utiliza un perfil local propio.
No se utiliza el modo *headless*, porque ChatGPT lo rechaza antes de mostrar el
editor. Si un reinicio deja bloqueado el perfil habitual, el servidor crea uno
aislado para no interrumpir el resto de proveedores. El proveedor puede exigir
inicio de sesión, limitar el uso o cambiar su estructura HTML. El programa no
evade CAPTCHA ni controles de acceso; en esos casos la automatización se detiene
y muestra el error.
