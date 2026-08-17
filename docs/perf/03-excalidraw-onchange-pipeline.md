# PERF-03: pipeline de `onChange` de Excalidraw

**Prioridad:** P0  
**Owner sugerido:** canvas host scene  
**Estado:** pendiente de profiling e implementación

## Problema

`handleExcalidrawChange()` ejecuta operaciones costosas antes de conocer si el cambio es hover, drag, dibujo o una mutación que requiere mantenimiento.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:882-949` contiene el pipeline completo.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:890-892` intenta persistir archivos en cada callback con archivos presentes.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:897-908` consulta escena, hint y browser target.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:932-943` documenta spam de hover y el early return de drag.
- `src/renderer/src/organisms/pdf-canvas/usePdfHostScene.ts:82-153` puede escanear escena, reparar elementos y llamar `updateScene()` varias veces.
- `src/renderer/src/lib/pdf-canvas/attachments.ts:98-117` recorre todos los archivos entregados.

## Impacto esperado

- Menor scripting en hover y drag.
- Menos callbacks encadenados de Excalidraw.
- Menos scans completos de escena y del mapa de archivos.

## Alcance

- Reordenar guardas y clasificar el origen del cambio.
- Coalescer mantenimiento de arrows/notas/capturas.
- Evitar persistencia redundante de binarios.

## Fuera de alcance

- Cambiar el contrato público de `onChange` de Excalidraw.
- Quitar reparaciones necesarias de integridad.
- Reescribir arrows o bindings sin tests funcionales.

## Dirección recomendada

1. Ejecutar primero las salidas triviales de restauración, hover y drag.
2. Mantener un cache de ids de archivos persistidos y detectar cambios de identidad/tamaño antes de recorrer todos.
3. Ejecutar `syncSearchBrowseHint` y `syncBrowserTarget` solo si cambió selección/hover relevante.
4. Coalescer `runHostSceneMaintenance` a un único trabajo por frame o por pointerup.
5. Añadir una guardia de reentrancia si `updateScene()` de mantenimiento genera otro `onChange`.

## Criterios de aceptación

- Hover sobre un embeddable no serializa ni escanea la escena completa.
- Drag mantiene arrows correctos y solo reconcilia al pointerup o al frame necesario.
- Un archivo nuevo sigue persistiendo y aparece en el autosave.
- Undo/redo conserva reparación y arrows.
- No hay regresiones en `notes.spec.ts`, `highlights.spec.ts`, `web-search-capture.spec.ts` y `pass-through-race.spec.ts`.

## Medición

- Duración y frecuencia de `handleExcalidrawChange`.
- Número de `updateScene()` causado por mantenimiento.
- Número de elementos y archivos recorridos por callback.

## Conflictos

Comparte `PdfCanvasApp.tsx` con PERF-01/04 y `usePdfTextPass.tsx` con PERF-02. Primero acordar clasificación de eventos para no duplicar guardas.
