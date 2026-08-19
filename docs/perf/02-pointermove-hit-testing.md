# PERF-02: pointermove y hit-testing

**Prioridad:** P0  
**Owner sugerido:** interacción canvas  
**Estado:** pendiente de profiling e implementación

## Problema

La compuerta de `.pdf-text-pass` y el hint de embeddables hacen trabajo de DOM y de escena en cada `pointermove`. Hay dos listeners relacionados: uno en el contenedor y otro en el host de Excalidraw.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:489-550` busca páginas, mide rectángulos y ejecuta `findSceneElementAt`.
- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:552-554,808-823` conecta el listener sin throttling.
- `src/renderer/src/organisms/pdf-canvas/usePdfTextPass.tsx:878-937` busca notas/capturas y sincroniza hints en el host.
- `src/renderer/src/lib/pdf-canvas/sceneHit.ts:52-63` hace un recorrido lineal de elementos.

## Impacto esperado

- Jank al mover el puntero sobre páginas con varias páginas montadas.
- Coste proporcional al número de elementos Excalidraw.
- Lecturas de layout frecuentes que pueden forzar trabajo de rendering del navegador.

## Alcance

- Reducir trabajo por frame sin romper selección de texto PDF.
- Mantener forwarding de `pointerdown`, lasso, selección de flechas y drag de embeddables.
- Mantener comportamiento de gutters y el pad de hit-test.

## Dirección recomendada

1. Guardar el último punto y procesarlo como máximo una vez por `requestAnimationFrame`.
2. Cachear los rectángulos de `[data-pdf-page]` y actualizar la cache desde cámara/resize/visible set.
3. Separar el hit-test de pass-through del hit-test de hints.
4. Si el punto y el id de embeddable no cambiaron, no reescribir atributos ni reposicionar chips.
5. Para escenas grandes, introducir un índice espacial pequeño en `sceneHit` o indexar solo elementos candidatos.

No usar `setState` por movimiento: el estado DOM/ref actual es la dirección correcta.

## Criterios de aceptación

- La selección de texto sobre PDF sigue funcionando en páginas visibles.
- El click sobre un elemento Excalidraw mientras pass-through está activo sigue seleccionándolo.
- El drag de una nota/captura no pierde el pointer ni el hint.
- Como máximo hay un cálculo de hit-test por frame.
- No aparecen regresiones en `pass-through-race.spec.ts`.

## Medición

- Chrome Performance durante movimiento sobre página vacía, escena con 100 shapes y escena con embeddables.
- Contar invocaciones de `getBoundingClientRect`, `getSceneElements` y `findSceneElementAt`.
- Comparar tiempo de scripting y frames perdidos.

## Conflictos

Comparte `usePdfTextPass.tsx` con PERF-03. No cambiar simultáneamente el listener y la lógica de `onChange` sin una base común de eventos.
