# Performance work packages

Estos documentos separan la auditoría de `react-pdf-canvas-audit.md` en tareas paralelizables. Cada agente debe leer este índice antes de editar y respetar la matriz de conflictos.

## Paquetes

| ID      | Documento                                                                    | Prioridad | Área principal              | Conflictos directos                                          |
| ------- | ---------------------------------------------------------------------------- | --------- | --------------------------- | ------------------------------------------------------------ |
| PERF-01 | [`01-persistence-signature.md`](./01-persistence-signature.md)               | P0        | Dirty gate / autosave       | `PdfCanvasApp.tsx`, `usePdfPersistence.ts`                   |
| PERF-02 | [`02-pointermove-hit-testing.md`](./02-pointermove-hit-testing.md)           | P0        | Pointer / layout / hit-test | `usePdfTextPass.tsx`                                         |
| PERF-03 | [`03-excalidraw-onchange-pipeline.md`](./03-excalidraw-onchange-pipeline.md) | P0        | Excalidraw callbacks        | `PdfCanvasApp.tsx`, `usePdfHostScene.ts`                     |
| PERF-04 | [`04-react-render-fanout.md`](./04-react-render-fanout.md)                   | P1        | React renders / memo        | `PdfCanvasApp.tsx`, `PdfLayer.tsx`, `PdfSidebar.tsx`         |
| PERF-05 | [`05-thumbpool-concurrency.md`](./05-thumbpool-concurrency.md)               | P1        | PDFium render queue         | `ThumbPool.ts`                                               |
| PERF-06 | [`06-pdf-buffer-memory.md`](./06-pdf-buffer-memory.md)                       | P1        | PDF buffer / RAM            | `PdfCanvasApp.tsx`, `PdfDocument.ts`                         |
| PERF-07 | [`07-catalog-writeback.md`](./07-catalog-writeback.md)                       | P1        | Zustand / disk writes       | `categories.ts`, `catalogWriteback.ts`                       |
| PERF-08 | [`08-pdf-search-progress.md`](./08-pdf-search-progress.md)                   | P1        | Search allocations          | `pdfSearch.ts`, `usePdfFindBar.ts`                           |
| PERF-09 | [`09-sidebar-autoscroll-timer.md`](./09-sidebar-autoscroll-timer.md)         | P2        | Timer lifecycle             | `templates/sidebar.tsx`                                      |
| PERF-10 | [`10-sidebar-rerenders-observer.md`](./10-sidebar-rerenders-observer.md)     | P2        | Sidebar React / observers   | `PdfSidebar.tsx`                                             |
| PERF-11 | [`11-render-time-sorting.md`](./11-render-time-sorting.md)                   | P2        | Derived catalog views       | `pages/category.tsx`, `recentPdfs.ts`                        |
| PERF-12 | [`12-raf-async-cleanup.md`](./12-raf-async-cleanup.md)                       | P2        | rAF / async teardown        | `usePdfHostScene.ts`, `usePdfPersistence.ts`, `PdfLayer.tsx` |
| PERF-13 | [`13-motion-bundle.md`](./13-motion-bundle.md)                               | P2        | Bundle / Motion             | `App.tsx`, shell components                                  |
| PERF-14 | [`14-language-context-value.md`](./14-language-context-value.md)             | P2        | Context identity            | `lang-context.tsx`                                           |
| PERF-15 | [`15-refs-react-doctor.md`](./15-refs-react-doctor.md)                       | Review    | Refs / Doctor noise         | Several canvas hooks                                         |

## Cómo paralelizar

Se pueden ejecutar en paralelo estos grupos siempre que ningún agente edite los mismos archivos:

- **Grupo A, canvas hot path:** PERF-01, PERF-02 y PERF-03. PERF-01 y PERF-03 comparten `PdfCanvasApp.tsx`; asignarlos a agentes distintos solo para investigación/profiling o hacerlos secuencialmente para implementación.
- **Grupo B, recursos PDF:** PERF-05, PERF-06 y PERF-08. No comparten archivos principales.
- **Grupo C, shell/catálogo:** PERF-07, PERF-09, PERF-11, PERF-13 y PERF-14. PERF-07 y PERF-11 comparten el store; PERF-09 y PERF-13 comparten `templates/sidebar.tsx`.
- **Grupo D, render boundaries:** PERF-04 y PERF-10. PERF-04 toca `PdfSidebar.tsx`; coordinar antes de implementar ambos.
- **Grupo E, lifecycle/revisión:** PERF-12 y PERF-15. PERF-15 debe revisar cambios de PERF-01/03/04/12 antes de cerrar.

## Matriz de conflictos

| Archivos compartidos    | Paquetes que deben coordinarse     |
| ----------------------- | ---------------------------------- |
| `PdfCanvasApp.tsx`      | PERF-01, PERF-03, PERF-04, PERF-06 |
| `usePdfPersistence.ts`  | PERF-01, PERF-12                   |
| `usePdfTextPass.tsx`    | PERF-02, PERF-03                   |
| `PdfLayer.tsx`          | PERF-04, PERF-08, PERF-12          |
| `PdfSidebar.tsx`        | PERF-04, PERF-10                   |
| `templates/sidebar.tsx` | PERF-07, PERF-09, PERF-13          |
| `categories.ts`         | PERF-07, PERF-11                   |

## Reglas comunes

- No reemplazar Excalidraw, la cámara ni la virtualización.
- No poner páginas PDF en el element store de Excalidraw.
- No convertir cámara, hover o geometría de alta frecuencia en `useState`.
- No cambiar warnings de React Doctor a ciegas; validar cada uno contra el flujo real.
- Mantener índices de página 0-based.
- Añadir tests unitarios junto a lógica pura y e2e solo para regresiones de comportamiento.
- Antes/después: medir producción y desarrollo con React Scan deshabilitado.
- Cada paquete debe documentar la métrica que mejora y no solo el cambio de código.

## Validación transversal

Repetir como mínimo:

1. Abrir PDF de 2 páginas y usar navegación, selección, notas y sidebar.
2. Hacer zoom/pan continuo sobre una escena con anotaciones.
3. Escribir una nota larga mientras la cámara permanece estable.
4. Activar/desactivar Pages, Outline y Annotations.
5. Navegar fuera del PDF durante render, autosave o drag.
6. Ejecutar `bun test` y los e2e afectados por el paquete.
