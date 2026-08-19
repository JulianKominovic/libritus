# PERF-08: progreso y allocations de búsqueda PDF

**Prioridad:** P1  
**Owner sugerido:** búsqueda PDF  
**Estado:** pendiente de profiling e implementación

## Problema

La búsqueda usa `searchAllPages`, acumula resultados progresivamente y copia el array completo en cada callback de progreso.

## Evidencia

- `src/renderer/src/lib/pdf-canvas/pdfSearch.ts:47-74` inicia búsqueda de todas las páginas.
- `src/renderer/src/lib/pdf-canvas/pdfSearch.ts:93-102` acumula resultados y llama `matches.slice()`.
- `src/renderer/src/lib/pdf-canvas/pdfSearch.ts:104-116` vuelve a mapear resultados finales si es necesario.
- `src/renderer/src/organisms/pdf-canvas/usePdfFindBar.ts:95-140` actualiza UI durante progreso y salta al primer match.
- `docs/architecture/infinite-pdf-canvas.md:5,104-120` fija el objetivo de PDFs de 3000+ páginas.

## Impacto esperado

- Copias O(M) repetidas para M matches.
- Garbage collector activo durante búsquedas grandes.
- Trabajo de merge de rects y arrays intermedios en el hilo del renderer.

## Alcance

- Reducir copias y frecuencia de notificaciones sin perder resultados.
- Mantener abort con `AbortController`.
- Mantener primer match, navegación y overlay de búsqueda.

## Dirección recomendada

1. Notificar progreso como máximo una vez por frame o con una cadencia mínima.
2. Evitar `matches.slice()` si el consumidor puede recibir una estructura controlada o un snapshot espaciado.
3. Separar estado mínimo para primer match de la lista completa.
4. Evaluar acumular por página y aplanar solo al finalizar.
5. Mantener un límite de trabajo visible para `setSearchHit`.

No paralelizar páginas sin medir PDFium: el objetivo es reducir allocations y UI churn, no aumentar presión del worker.

## Criterios de aceptación

- La búsqueda sigue encontrando todos los matches.
- Abort durante búsqueda no actualiza la UI con resultados stale.
- El primer resultado continúa centrando la cámara una sola vez.
- La UI no recibe más de una actualización por frame.
- Tests actuales de `pdfSearch` siguen pasando y se añade cobertura de progreso espaciado.

## Medición

- PDF de 3000 páginas con cero, pocos y muchos matches.
- Número de callbacks, tamaño de arrays copiados y tiempo de scripting.
- Memoria temporal y duración hasta primer match/resultado final.

## Conflictos

Comparte `PdfLayer.tsx` indirectamente por el overlay, pero no debería mezclar cambios de render fan-out de PERF-04 en el mismo commit.
