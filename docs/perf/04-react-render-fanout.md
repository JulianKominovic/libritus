# PERF-04: fan-out de renders React

**Prioridad:** P1  
**Owner sugerido:** React canvas boundaries  
**Estado:** pendiente de profiling e implementación

## Problema

`PdfCanvasAppInner` concentra muchos estados y renderiza simultáneamente Excalidraw, PDF layer, toolbar y sidebar. Cambios de UI que no afectan al PDF pueden volver a ejecutar el árbol de páginas.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:221-226` declara estados que rerenderizan el padre.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:1061-1127` renderiza Excalidraw y props inline.
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:48-66,165-225,268-350` no usa `memo` para `PdfLayer` ni `PageSlotView`.
- `src/renderer/src/lib/pdf-canvas/PagePool.ts:231-236` notifica al completar cada página.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:283-399,435-505` fuerza renders por pool y lista filas sin memo.

## Impacto esperado

- Más renders al cambiar save status, toolbar, annotations o tabs.
- Reconciliación de `SelectionLayer`, link overlays y canvas hosts aunque sus props no hayan cambiado.
- Fan-out especialmente visible al completar varias páginas del pool.

## Alcance

- Crear boundaries de render y estabilizar props.
- Mantener la sincronización imperativa de cámara.
- Preservar slot/canvas attachment y virtualization.

## Dirección recomendada

1. Medir primero con React Profiler.
2. Envolver `PageSlotView` en `memo` con props estables.
3. Evaluar `memo(PdfLayer)` y `memo(PdfSidebar)` con comparación explícita de session/pool/layout.
4. Usar `EMPTY_LINKS` para evitar arrays nuevos.
5. Estabilizar callbacks y `UIOptions` entregados a Excalidraw.
6. Mantener `setTick()` solo para cambios que afecten visualmente a la fila correspondiente.

No añadir `useMemo`/`useCallback` indiscriminadamente: deben existir boundaries que aprovechen esas identidades.

## Criterios de aceptación

- Un cambio de save status no rerenderiza páginas cuyos props no cambiaron.
- Una página lista no rerenderiza todos los slots innecesariamente.
- El canvas sigue montando/desmontando el elemento correcto al evictar.
- No cambia el orden ni el número de páginas visibles.
- React Profiler muestra reducción de commits en apertura y carga incremental.

## Conflictos

Comparte `PdfCanvasApp.tsx` con PERF-01/03/06 y `PdfSidebar.tsx` con PERF-10. Coordinar antes de modificar declaraciones o props.
