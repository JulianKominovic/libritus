# React y PDF Canvas: auditoría de rendimiento

**Fecha:** 2026-08-17  
**Alcance:** renderer React, Excalidraw host, EmbedPDF/PDFium, pools de páginas, persistencia, sidebar y shell de navegación.  
**Repositorio auditado:** `/Users/julian/dev/libritus`

## Resumen ejecutivo

El cuello principal no parece estar en `PagePool`, sino en el trabajo que el host ejecuta alrededor de Excalidraw:

1. Serialización completa de la escena en eventos calientes.
2. Hit-testing lineal y lecturas de layout en cada `pointermove`.
3. `onChange` ejecutando varias pasadas antes de sus early returns.
4. Fan-out de renders en `PdfCanvasApp`, `PdfLayer` y `PdfSidebar`.
5. Thumbnails sin límite explícito de concurrencia del host.
6. Escrituras completas de `categories.json` durante autosave.

La arquitectura de cámara, virtualización y hard caps de bitmap está bien orientada. No se recomienda reemplazar Excalidraw ni construir otra cámara sin medir primero estos hot paths.

## React Doctor

Se ejecutó el binario local `react-doctor@0.9.12` desde la raíz del repositorio con:

```bash
node_modules/.bin/react-doctor \
  --no-telemetry \
  --no-supply-chain \
  --no-dead-code \
  --no-cache \
  --no-color \
  --json
```

Resultado del escaneo:

- 347 archivos analizados.
- 15 errores y 87 advertencias.
- 42 archivos afectados.
- Score deshabilitado por `--no-telemetry`.
- La categoría Performance mostró 28 advertencias.

React Doctor debe tratarse como detector de hipótesis. En este repositorio marca como errores algunas refs que son deliberadamente imperativas para evitar re-renders y reabrir sesiones. Cada diagnóstico debe validarse con el código y con profiling.

## Prioridad P0

### 1. Firma de persistencia en hot paths

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/usePdfNavigation.ts:104-114`
- `src/renderer/src/organisms/pdf-canvas/usePdfNotes.tsx:72-85`
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:88-109,162-167,222-255`
- `src/renderer/src/lib/pdf-canvas/sessionPersist.ts:31-39`

`handleScrollChange()` llama a `markUnsaved()` en cada actualización de cámara. `updateNotePlateValue()` también llama a `markUnsaved()` potencialmente en cada tecla.

`currentPersistSignature()` hace lo siguiente:

1. Obtiene toda la escena.
2. Filtra y normaliza todos los elementos.
3. Ejecuta `JSON.parse(JSON.stringify(elements))`.
4. Ejecuta otra serialización en `persistSignature()`.

El fast path solo evita el trabajo durante un drag cuando la sesión ya está dirty. No protege wheel/trackpad ni edición de notas.

**Impacto:** bloqueo del hilo principal proporcional al número y tamaño de elementos, aunque solo haya cambiado la cámara o un carácter de una nota.

**Recomendación:**

- Separar “hubo una mutación persistible” de “calcular la firma completa”.
- No recalcular la firma de toda la escena para cada cámara ni cada tecla.
- Cachear una firma/canonicalización de escena y recalcularla al cambiar elementos persistibles.
- Dejar la serialización completa para el debounce de autosave y el flush de salida.
- No limitarse a cambiar `JSON.parse(JSON.stringify(...))` por `structuredClone()`: eso reduce una copia, pero no elimina el coste de recorrer y serializar toda la escena.

### 2. `pointermove` con hit-testing O(N)

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:489-550`
- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:552-554,808-823`
- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:878-937`
- `src/renderer/src/lib/pdf-canvas/sceneHit.ts:52-63`

El listener del contenedor puede hacer, por cada movimiento:

- `querySelectorAll('[data-pdf-page]')`.
- `getBoundingClientRect()` para cada página montada.
- `getSceneElements()`.
- `findSceneElementAt()`, que es un recorrido lineal.

El listener del host también recorre la escena para encontrar notas y capturas, sincroniza el hint y vuelve a consultar elementos seleccionados. No hay coalescing por `requestAnimationFrame`.

`setPdfTextPass()` evita cambios React redundantes, pero el trabajo anterior al setter continúa ejecutándose.

**Recomendación:**

- Coalescer hit-testing a un único `requestAnimationFrame` por frame.
- Cachear los rectángulos DOM hasta que cambie cámara, resize o visible set.
- Evitar recalcular el hint cuando el id bajo el puntero no cambió.
- Considerar un índice espacial para elementos cuando las escenas grandes sean un caso real.
- Mantener intacta la semántica de `.pdf-text-pass`, selección y forwarding de pointerdown.

### 3. `onChange` demasiado caro antes del early return

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:882-949`
- `src/renderer/src/lib/pdf-canvas/attachments.ts:98-117`
- `src/renderer/src/organisms/pdf-canvas/usePdfHostScene.ts:82-153`

Antes de comprobar hover o drag, `handleExcalidrawChange()`:

- Recorre el mapa de archivos y llama a persistencia de adjuntos.
- Busca el highlight activo en toda la escena.
- Ejecuta `syncSearchBrowseHint()`.
- Ejecuta `syncBrowserTarget()`.
- Inspecciona y puede corregir el tipo de arrow.
- Programa sincronización de arrows.

El propio código documenta que Excalidraw genera spam de `onChange` al hacer hover sobre embeddables (`PdfCanvasApp.tsx:932-936`). Después del early return, `runHostSceneMaintenance()` puede volver a escanear, mapear y llamar a `updateScene()` varias veces.

**Recomendación:**

- Clasificar primero el origen del cambio: hover, cámara, drag, dibujo o mutación semántica.
- Mover el trabajo O(N) detrás de las guardas más tempranas posibles.
- Persistir archivos solo cuando cambie la identidad del mapa de archivos, no en cada callback.
- Coalescer mantenimiento de escena y evitar varias llamadas `updateScene()` para una sola mutación.
- Medir si las reparaciones de host provocan callbacks `onChange` adicionales.

## Prioridad P1

### 4. Fan-out React de `PdfCanvasApp`

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:221-226`
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:1061-1127`
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:48-66,165-225,268-350`
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:283-399,435-505`

`PdfCanvasAppInner` contiene session, outline, annotations, load error, save status, modos de colocación y estado del toolbar. El mismo render contiene Excalidraw, la capa PDF, chrome, toolbar y sidebar.

`PdfLayer` no está envuelto en `memo`. `PageSlotView` tampoco. Cada página que termina de rasterizar llama a `notify()`, que se transforma en `setTick()` y vuelve a invocar todas las filas de páginas montadas.

Además hay callbacks y objetos inline en Excalidraw:

- `onExcalidrawAPI`.
- `onInitialize`.
- `onDuplicate`.
- `onLinkOpen`.
- `validateEmbeddable`.
- `UIOptions`.

**Recomendación:**

- Añadir boundaries de render entre el host, `PdfLayer`, toolbar y sidebar.
- Memoizar `PageSlotView`, `ThumbRow`, `OutlineRow` y `AnnotationRow` después de medir.
- Estabilizar callbacks y objetos de opciones.
- Usar una constante para `links ?? EMPTY_LINKS`; un `[]` nuevo por página derrota `memo`.
- No convertir cámara o página activa en estado React: el diseño imperativo actual es correcto.

### 5. Thumbnails sin límite de concurrencia

**Evidencia:**

- `src/renderer/src/lib/pdf-canvas/ThumbPool.ts:45-103`
- `src/renderer/src/lib/pdf-canvas/PagePool.ts:6-8,158-170`

`ThumbPool.syncVisible()` crea una promesa de render para cada índice visible y espera `Promise.all()`. El pool de páginas principal sí tiene `MAX_CONCURRENT = 2`; el pool de thumbnails no tiene un límite equivalente.

**Impacto:** cambiar a la pestaña Pages puede postear muchos renders PDFium simultáneos y producir picos de CPU, memoria y presión del worker.

**Recomendación:** reutilizar un scheduler bounded, probablemente con una concurrencia menor o igual a la del pool principal, y añadir tests de máximo de renders en vuelo.

### 6. Buffer completo del PDF y copia adicional

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:516-543`
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:524-528`
- `src/renderer/src/lib/pdf-canvas/PdfDocument.ts:37-46`
- `AGENTS.md:134-156`

La apertura lee el PDF completo en RAM y crea una copia porque el engine puede transferir el buffer al worker. Durante la apertura pueden coexistir el `Uint8Array`, el `ArrayBuffer` copiado y la representación del worker.

**Recomendación:** medir el pico real antes de cambiarlo. El camino estructural pendiente es streaming/range/OPFS. No conviene eliminar la copia sin confirmar las reglas de ownership del engine.

### 7. Escrituras globales durante autosave

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:186-205`
- `src/renderer/src/lib/pdf-canvas/catalogWriteback.ts:4-35`
- `src/renderer/src/stores/categories.ts:153-156,222-234`
- `src/renderer/src/templates/sidebar.tsx:50-84,378-381`
- `src/renderer/src/templates/navbar.tsx:33-121`

Al guardar progreso o estadísticas se actualiza el array completo de categorías y se serializa todo `categories.json`. Navbar, Sidebar y otros consumidores están suscritos al array completo.

**Recomendación:**

- Mantener progreso transitorio en una estructura más acotada.
- Escribir el catálogo con debounce o una cola de escritura.
- Reducir suscripciones al array completo mediante selectores más específicos o una estructura normalizada.
- Verificar que no haya escrituras concurrentes que se pisen.

### 8. Copias progresivas en búsqueda PDF

**Evidencia:**

- `src/renderer/src/lib/pdf-canvas/pdfSearch.ts:47-116`

La búsqueda recorre todas las páginas, acumula matches y ejecuta `matches.slice()` en cada progreso. En un PDF grande con muchos resultados, el coste temporal y la basura temporal pueden crecer rápidamente.

**Recomendación:**

- Publicar progreso como máximo una vez por frame.
- Evitar copiar todo el array para cada página.
- Separar “primer match para saltar” de “lista completa final”.

## Prioridad P2

### 9. Timer de auto-scroll del sidebar

**Evidencia:** `src/renderer/src/templates/sidebar.tsx:102-151`.

`timer` vive como variable local del render, se reasigna desde el callback del monitor y el cleanup solo ejecuta `unsubscribe()`. Un intervalo activo puede sobrevivir al desmontaje.

**Recomendación:** guardar el id en un ref y ejecutar `clearInterval()` en el cleanup y antes de crear otro intervalo.

### 10. Re-renders del sidebar y `ResizeObserver`

**Evidencia:** `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:293-399,435-505`; `FadeClip` en `:72-84`.

Cada thumbnail lista provoca `setTick()`, y el cambio de página también. Las filas visibles se vuelven a ejecutar todas. `FadeClip` depende de `children`, que recibe JSX nuevo en cada render, por lo que puede reinstalar su `ResizeObserver` frecuentemente.

**Recomendación:** memoizar filas, estabilizar callbacks y hacer que el observer dependa del nodo/contenido relevante, no de la identidad JSX completa.

### 11. Ordenamiento durante render

**Evidencia:**

- `src/renderer/src/pages/category.tsx:213-217`
- `src/renderer/src/pages/home.tsx:102-110`
- `src/renderer/src/lib/recentPdfs.ts:6-10`

`category.pdfs.sort()` muta el array perteneciente al store y repite O(P log P) en cada render. Home también aplana y ordena todas las categorías en cada render.

**Recomendación:** usar una copia no mutante y derivación memoizada o selectores específicos. El problema es más importante si el catálogo contiene muchos PDFs.

### 12. Timers y `requestAnimationFrame` sin cancelación completa

**Evidencia:**

- `src/renderer/src/organisms/pdf-canvas/usePdfHostScene.ts:45-79`
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:153-160`
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:221-225,268-282`

Hay rAF anidado para sincronización de arrows y limpieza de links, y continuaciones async que pueden terminar después de desmontar el componente. La mayoría tiene guardas de API/generación, por lo que el impacto probablemente es bajo, pero conviene cancelar explícitamente el trabajo pendiente al desmontar.

### 13. Imports completos de Motion

**Evidencia:**

- `src/renderer/src/App.tsx:1`
- `src/renderer/src/pages/home.tsx:1,11`
- `src/renderer/src/pages/settings.tsx:22`
- `src/renderer/src/templates/sidebar.tsx:33`
- `src/renderer/src/components/ui/context-menu-animated.tsx:4`

React Doctor marca el uso completo de Motion como coste de bundle. El shell (`App`, `Sidebar`, `Home`) es más relevante que código ya lazy-loaded.

**Recomendación:** evaluar `LazyMotion`/`m` solo después de medir el bundle inicial y confirmar compatibilidad con `motion/react` usado por el proyecto.

### 14. Context value inestable

**Evidencia:** `src/renderer/src/i18n/lang-context.tsx:27-49`.

El provider crea `value={{ lang, setLang, t }}` inline. React Doctor lo detecta como fuente potencial de renders en todos los consumidores.

**Recomendación:** memoizar el value con la dependencia real `lang`.

## Refs y estados: clasificación

### Probablemente intencionales

Estas refs evitan estado React en geometría, cámara o listeners globales:

- `PdfCanvasApp.tsx:171-178` mantiene la última traducción y capabilities.
- `PdfLayer.tsx:181-187` mantiene identidades actuales para callbacks imperativos.
- `PdfSidebar.tsx:287-289` mantiene la traducción para actualizar el marcador sin render del padre.
- `usePdfTextPass.tsx:121-122` mantiene el callback actual dentro de listeners estables.
- `usePdfRagChat.ts:69-80` mantiene valores actuales para callbacks async, pero el chat está desmontado según `docs/features/pdf-rag-chat.md:5-7`.

Convertirlas masivamente a `useState` introduciría precisamente los re-renders que la arquitectura intenta evitar.

### Requiere revisión

- `NoteEmbed.tsx:124-128` muta `initialValueRef.current` durante render. Puede ser correcto funcionalmente, pero es el caso con mayor riesgo bajo render concurrente porque conserva un valor basado en un render que podría no comprometerse.
- `PdfCanvasApp.tsx:492-726` depende de la estabilidad de `documentManager`. Si la capability cambia de identidad inesperadamente, el efecto puede destruir y reabrir la sesión completa.
- `usePdfFindBar.ts:148-156` ejecuta `clearSearchUi()` dentro del updater de `setFindOpen`; React puede reejecutar updaters en ciertos escenarios.

### Falsos positivos o bajo impacto

- `useQuitFlush.ts:6-13` retorna directamente el cleanup que entrega `ipcRenderer.on()`, por lo que el diagnóstico de suscripción sin cleanup parece falso positivo.
- Los warnings `exhaustive-deps` sobre refs estables no deben resolverse agregando estado o dependencias indiscriminadamente.

## Salud actual de la arquitectura

Hay varias decisiones correctas que no deberían revertirse:

- `PagePool` tiene hard cap, LRU, cancelación y concurrencia limitada: `PagePool.ts:43-47,70-135,158-170`.
- Los canvas evictados liberan sus buffers: `pool-core.ts:52-88`.
- La cámara se sincroniza de forma imperativa: `usePdfCamera.ts:40-59`.
- El zoom usa transform CSS y no re-rasteriza cada tick: `PdfLayer.tsx:162-164`.
- Las páginas permanecen fuera del element store de Excalidraw, como exige `AGENTS.md:151-166`.
- Las notas ya amortiguan los cambios Plate en una ref: `usePdfNotes.tsx:72-85`.
- La búsqueda usa debounce y aborta búsquedas anteriores: `usePdfFindBar.ts:95-140`.

## Plan de medición

1. Ejecutar Chrome Performance en producción y repetir en desarrollo con React Scan deshabilitado.
2. Medir scroll, zoom, hover sobre embeddables y escritura de notas.
3. Instrumentar duración de `markUnsaved`, `JSON.stringify`, `getBoundingClientRect`, `findSceneElementAt` y `onChange`.
4. Repetir con escenas de 10, 100 y 1000 elementos.
5. Medir commits con React DevTools Profiler para `PdfCanvasApp`, `PdfLayer`, `PdfSidebar` y filas.
6. Abrir PDFs grandes y medir heap antes/después de abrir, cambiar de página y activar thumbnails.
7. Medir cuántos renders PDFium simultáneos produce `ThumbPool`.
8. Medir cantidad y duración de escrituras de `categories.json` durante navegación y autosave.

El benchmark existente solo registra startup y paint; no aserta frame time, commits React ni memoria: `e2e/startup.spec.ts:5-39`. Los scripts disponibles tampoco incluyen un benchmark de canvas: `package.json:25-29`.

## Orden recomendado de trabajo

1. Separar dirty gate de serialización completa.
2. Coalescer y cachear el pipeline de `pointermove`.
3. Mover trabajo O(N) de `onChange` detrás de guardas tempranas.
4. Memoizar boundaries de `PdfLayer`/sidebar y medir el fan-out.
5. Limitar concurrencia de `ThumbPool`.
6. Corregir el timer del sidebar y revisar rAF pendientes.
7. Reducir catálogo global y escrituras completas.
8. Revisar Motion, contexto y refs después de tener métricas.

No se recomienda como solución de rendimiento construir Pixi, otra cámara o un motor PDF alternativo sin demostrar primero que Excalidraw es el cuello dominante.
