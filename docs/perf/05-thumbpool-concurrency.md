# PERF-05: concurrencia de `ThumbPool`

**Prioridad:** P1  
**Owner sugerido:** PDFium pools  
**Estado:** pendiente de implementación

## Problema

El pool principal limita renders PDFium a dos trabajos en vuelo, pero `ThumbPool` lanza un render por cada índice visible y espera `Promise.all()`.

## Evidencia

- `src/renderer/src/lib/pdf-canvas/ThumbPool.ts:45-103` crea todos los `renderSlot()` de una vez.
- `src/renderer/src/lib/pdf-canvas/ThumbPool.ts:118-167` crea tareas PDFium sin scheduler compartido.
- `src/renderer/src/lib/pdf-canvas/PagePool.ts:6-8,158-170` tiene `MAX_CONCURRENT = 2` y queue explícita.
- `src/renderer/src/lib/pdf-canvas/ThumbPool.test.ts:68-103` cubre hard cap, pero no máximo de concurrencia.

## Impacto esperado

- Picos de CPU al abrir la pestaña Pages.
- Más memoria temporal de imágenes raw y `ImageData`.
- Mayor competencia con renders de páginas principales.

## Alcance

- Añadir queue/concurrency cap para thumbnails.
- Mantener cancelación por generación y hard cap de slots.
- Mantener prioridad del visible set.

## Dirección recomendada

1. Introducir un límite pequeño, inicialmente 2 o 3.
2. Registrar trabajos pendientes antes de iniciar la tarea para que puedan cancelarse.
3. Drenar la queue respetando la generación más reciente.
4. Reutilizar primitives de `PagePool` solo si no introduce acoplamiento innecesario.

## Criterios de aceptación

- Nunca hay más de la concurrencia configurada en `renderPageRaw`.
- Cambiar rápidamente de pestaña no deja renders viejos marcando slots como ready.
- Los índices visibles aparecen eventualmente aunque haya cancelaciones.
- `ThumbPool.test.ts` incluye una prueba de máximo de renders en vuelo.
- La navegación y el render de página principal no pierden prioridad perceptible.

## Medición

- Contar tareas `renderPageRaw` simultáneas.
- Medir tiempo hasta primera thumbnail y tiempo hasta completar el visible set.
- Medir memoria durante Pages con pool lleno.
