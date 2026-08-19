# PERF-06: buffer completo del PDF y pico de RAM

**Prioridad:** P1  
**Owner sugerido:** EmbedPDF / lifecycle de documentos  
**Estado:** pendiente de medición; cambio estructural posterior

## Problema

Abrir un PDF lee el archivo completo en el renderer y después crea una copia del buffer antes de entregarlo a DocumentManager. El engine puede transferir el buffer al worker, por eso existe la copia, pero durante la apertura pueden coexistir varias representaciones.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:516-543` lee y abre el buffer.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:524-528` hace `bytes.buffer.slice(...)`.
- `src/renderer/src/lib/pdf-canvas/PdfDocument.ts:37-46` abre buffers completos.
- `src/renderer/src/lib/pdf-canvas/PdfDocument.ts:30-34` materializa `pageSizes` desde `handle.pages`.
- `AGENTS.md:134-156` identifica el PDF completo en RAM como una fuente conocida y deja streaming/range/OPFS pendiente.

## Impacto esperado

- Pico de RAM proporcional al tamaño del PDF durante open.
- El pico puede coincidir con ArrayBuffer del worker, metadata, page sizes y Excalidraw.
- En PDFs grandes puede competir con bitmaps de `PagePool`.

## Alcance

- Medir ownership y lifetime de `bytes`, `ab` y buffer del worker.
- Liberar referencias del renderer tan pronto como sea seguro.
- Preparar una decisión futura de streaming/range/OPFS.

## Fuera de alcance

- Eliminar la copia sin confirmar si EmbedPDF transfiere el buffer.
- Cambiar `DocumentManager` o parchear node_modules.
- Reemplazar PDFium.

## Dirección recomendada

1. Instrumentar memoria antes de `readFile`, después de `ab`, después de `openDocumentBuffer` y tras `bytes` fuera de scope.
2. Confirmar con EmbedPDF si acepta ownership transferido y si puede abrir desde un backing store/range.
3. Evitar conservar referencias al `Uint8Array` más allá del open.
4. Documentar límites de tamaño y degradación esperada.
5. Mantener los hard caps de page/thumb pools mientras se investiga streaming.

## Criterios de aceptación

- El comportamiento de open race y close no cambia.
- El PDF sigue seleccionable y renderizable después de liberar el buffer local.
- El pico de memoria queda medido en PDFs pequeños, medianos y grandes.
- Si no hay mejora segura local, queda documentado como trabajo de streaming/range.

## Medición

- Heap renderer y memoria del proceso Electron.
- Tamaños de PDFs de 10 MB, 100 MB y 500 MB o fixtures equivalentes.
- Abrir, cambiar de PDF y cerrar repetidamente para detectar retención.

## Conflictos

Comparte `PdfCanvasApp.tsx` con PERF-01/03/04. No mezclar una optimización de buffer con cambios de persistencia o render boundaries sin mediciones separadas.
