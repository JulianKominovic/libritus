# PERF-10: renders del PDF sidebar y `ResizeObserver`

**Prioridad:** P2  
**Owner sugerido:** PDF sidebar UI  
**Estado:** pendiente de profiling e implementación

## Problema

`PdfSidebar` fuerza un render completo cuando cambia la página activa o termina una thumbnail. Las filas visibles y `FadeClip` pueden recrear trabajo aunque el contenido no cambie.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:292-299` declara `tick` para forzar renders.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:351-369` incrementa `tick` por página activa y pool.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:435-505` vuelve a crear las filas virtuales.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:72-84` hace que `FadeClip` dependa de la identidad de `children`.
- `src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx:308-334` limita filas mediante virtualización, por lo que el impacto está acotado pero no eliminado.

## Impacto esperado

- Renders de todas las filas virtuales visibles por una thumbnail.
- Reinstalación de observers en anotaciones cuando JSX cambia de identidad.
- Trabajo de medición y layout repetido en tabs con contenido dinámico.

## Alcance

- Reducir renders de filas y observers.
- Mantener `aria-current`, mediciones dinámicas y virtualización.

## Dirección recomendada

1. Memoizar `ThumbRow`, `OutlineRow` y `AnnotationRow` con props estables.
2. Separar marcador de página activo de la lista de thumbnails.
3. Hacer que `FadeClip` dependa de un cambio de contenido/medida real, no de cada JSX nuevo.
4. Mantener `ResizeObserver` conectado mientras el nodo viva.
5. Revisar si `tick` puede dividirse en una señal de slot y otra de página activa.

## Criterios de aceptación

- Una thumbnail lista actualiza solo la fila afectada o el mínimo necesario.
- El marcador activo sigue actualizándose sin perder `aria-current`.
- Annotations con texto largo siguen midiendo correctamente.
- Cambiar de tab no deja observers duplicados.
- `outline-thumbs.spec.ts` y `annotation-panel.spec.ts` pasan.

## Medición

- React Profiler contando renders por fila durante carga de 16 thumbnails.
- Número de construct/disconnect de `ResizeObserver`.
- Tiempo de `virtualizer.measure()` y layout.

## Conflictos

Comparte `PdfSidebar.tsx` con PERF-04. Coordinar si ambos cambian componentes o estructura de tabs.
