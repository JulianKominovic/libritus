# PERF-15: refs mutadas durante render y diagnósticos de React Doctor

**Prioridad:** revisión transversal  
**Owner sugerido:** reviewer React  
**Estado:** no aplicar automáticamente

## Problema

React Doctor reporta 13 errores `no-ref-current-in-render` y varios warnings `exhaustive-deps`. Algunos son patrones deliberados para mantener callbacks/listeners estables y evitar re-renders; otros requieren revisión bajo React concurrent.

## Evidencia

### Refs probablemente intencionales

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:171-178` mantiene `t`, `documentManager` y `selectionCapability` actuales.
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:181-187` mantiene props actuales para callbacks imperativos de cámara.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:287-289` mantiene `t` para actualizar el marcador DOM sin render.
- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:121-122` mantiene el callback de hint dentro de listeners estables.
- `src/renderer/src/organisms/pdf-canvas/usePdfRagChat.ts:69-80` mantiene callbacks async; el chat está desmontado según `docs/features/pdf-rag-chat.md:5-7`.

### Refs que requieren revisión

- `src/renderer/src/organisms/pdf-canvas/NoteEmbed.tsx:124-128` modifica `initialValueRef.current` durante render.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:492-726` puede depender de la estabilidad de `documentManager` para no reabrir la sesión.
- `src/renderer/src/organisms/pdf-canvas/usePdfFindBar.ts:148-156` ejecuta `clearSearchUi()` dentro del updater de `setFindOpen`.

### Diagnóstico que parece falso positivo

- `src/renderer/src/hooks/use-quit-flush.ts:6-13` retorna directamente la función de cleanup entregada por `ipcRenderer.on()`.

## Impacto esperado

- Una mutación de ref durante render puede filtrar valores de un render que React descarte.
- Añadir estado para eliminar cada warning puede empeorar rendimiento y reintroducir loops de efectos.
- Añadir indiscriminadamente refs a dependency arrays puede no cambiar nada, pero también puede hacer que callbacks/efectos se reconstruyan si el valor real no es estable.

## Alcance

- Clasificar cada diagnóstico como verdadero, intencional o falso positivo documentado.
- Corregir solo los casos con riesgo observable.
- Mantener la estrategia imperativa de cámara, selección y overlays.

## Dirección recomendada

1. No convertir refs de alta frecuencia en `useState`.
2. Para `NoteEmbed`, revisar si el valor inicial puede capturarse al entrar en edición mediante un evento/efecto sin cambiar UX.
3. Verificar identidad de capabilities con React Profiler/log controlado.
4. Revisar callbacks async y cleanup antes de tocar dependencies.
5. Usar suppressions únicamente cuando el patrón intencional quede explicado y el tooling lo permita.

## Criterios de aceptación

- No se reabre el PDF al cambiar idioma o al rerenderizar el shell.
- No se pierde el valor inicial de una nota al alternar edición.
- Los listeners no se reinstalan en cada render.
- No se introducen renders por movimiento de cámara.
- Cada suppression o warning mantenido tiene una justificación en código o documentación.

## Medición

- React Profiler con navegación, cambio de idioma, edición de nota y cambio de sidebar.
- Probar renders interrumpidos/transiciones si el proyecto empieza a usar concurrent features.
- Verificar que la capability de DocumentManager conserve identidad entre renders.

## Conflictos

Este paquete debe ejecutarse como revisión posterior de PERF-01, PERF-03, PERF-04 y PERF-12. No debe editar los mismos archivos en paralelo sin revisar el diff completo.
