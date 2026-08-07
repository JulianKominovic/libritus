# 02 — Extraer hooks de `PdfCanvasApp.tsx` (god component)

- **Estado:** EN PLANIFICACIÓN
- **Fuente:** `ANALYSIS_REFACTOR.md` sección B.
- **Ownership (solo estos):** `organisms/pdf-canvas/PdfCanvasApp.tsx` + **nuevos** archivos
  hook en `organisms/pdf-canvas/` (p.ej. `hooks/usePdfPersistence.ts`, `usePdfNavigation.ts`,
  `usePdfHighlights.ts`, `usePdfNotes.ts`, `usePdfCamera.ts`).
- **Gate:** ninguno. Refactor de comportamiento idéntico. No cambia features.

## Objetivo

Reducir `PdfCanvasAppInner` (líneas 215–2762, ~2.548) extrayendo dominios a hooks, sin cambiar
comportamiento, sin añadir estado React a `onChange`, manteniendo el patrón ref + DOM de cámara/toolbars.

## Dominios actuales (anclas en `PdfCanvasApp.tsx`)

| Dominio | Anclas aprox. | Hook sugerido |
| ------- | ------------- | ------------- |
| Persistencia / autosave | `sceneElementsForPersist` L551, `stripPdfNoteLinks` L582, `queueStripPdfNoteLinks` L615, `currentPersistSignature` L624, `buildSnapshot` L631, `writeSnapshotNow` L648, `clearSaveTimer` L543, chip `syncSaveChip` L306, flush on leave | `usePdfPersistence` |
| Cámara / navegación | `cameraRef` L241, `pushCamera` L494, `goToPage` L1277 (1-based helpers L1326+), `currentPageRef`, `PageNavigator` handlers | `usePdfNavigation` / `usePdfCamera` |
| Highlights (selection → locked highlight) | `commitPendingHighlight` L1432, `pendingHighlightRef` L251, `activeHighlightIdRef` L247, toolbar show/position/hide L315–530 | `usePdfHighlights` |
| Notas WYSIWYG | `updateNotePlateValue` L1230, `noteIdsRef`, `pendingPlateByNoteIdRef`, `createNoteFromHighlight`/Add note, arrow sync | `usePdfNotes` |
| Search capture (ya es hook) | `useSearchCaptureBrowser` L362 — **ya external** | mantener |
| Arrows host-managed | `syncPdfNoteArrows` / `syncPdfSearchArrows` (onChange + restore) | `usePdfNoteArrows` |
| Pass-through / input gating | `setPdfTextPass` L338, `clearActiveEmbeddable` L344, pointer handlers, `handleKeyboardGlobally` | `usePdfTextPass` / mantener |

## Estrategia (incremental, 1 hook por commit/PR)

1. **Congelar comportamiento:** commit base con los tests actuales verdes
   (`bun test`, typecheck) como red de seguridad.
2. **Mover un dominio a la vez** en el orden de menor acoplamiento:
   1. `usePdfPersistence` (mayor autonomía: refs de snapshot/save + chip).
   2. `usePdfNavigation`/`usePdfCamera` (cámara + goToPage + prev/next + history).
   3. `usePdfHighlights` (toolbar + commit + color + Copiar).
   4. `usePdfNotes` (plate value + add note + arrows).
   5. Passthrough/input gating al final (es el que toca el DOM de Excalidraw).
3. Cada hook **recibe los refs/apis que necesita como parámetros** (documentManagerRef,
   apiRef, pdfLayerRef, etc.) y **devuelve** los callbacks/handlers que el componente pasa
   a `<Excalidraw>` y subcomponentes. No usar contexto global para pasar refs internos.
4. Entre cada extracción: `npm run typecheck` + `bun test` + smoke manual de pan/zoom/selección.
5. `PdfCanvasAppInner` queda como orquestador (estado mínimo + refs + delegación a hooks).

## Constraints (aprendizajes que NO repetir)

- **Nunca** poner geometría de overlays (toolbar/chrome) en React state disparado desde
  `onChange` de Excalidraw → `Maximum update depth`. Mantener `highlightToolbarRef` + DOM
  imperativo (`positionHighlightToolbar`).
- **No** patchear Excalidraw. Todo desde el host.
- **No** convertir los refs de cámara a state para “simplificar”. Excalidraw es el dueño de la cámara.
- No tocar el pass-through `.pdf-text-pass` / `[data-pdf-page]` (reglas AGENTS #7 y aprendizaje
  “Always-on text pass”).
- Mantener el early-return de `handleExcalidrawChange` con `multiElement`/`newElement` ≠ null
  (sin `updateScene` mid-draw) y el sync de flechas con `getSceneElementsIncludingDeleted()`
  **antes** de ese early-return.
- No cambiar IDs de elementos, `customData` keys, ni formato de sesión (compat hacia atrás).

## Verificación

- `npm run typecheck`, `bun test`.
- E2E: `notes.spec.ts`, `session.spec.ts`, `highlights.spec.ts`, `web-search-capture.spec.ts`,
  `search.spec.ts`, `autosave.spec.ts`, `open-race.spec.ts`, `quit-flush.spec.ts`.
- Smoke manual: pan/zoom fluido, selección de texto, crear nota + flecha, undo/redo,
  sesión persistida al recargar.

## Definition of done

- `PdfCanvasApp.tsx` reduce ≥ ~40% de sus líneas; cada dominio vive en un hook con nombre
  claro y deps explícitas.
- Cero cambios de comportamiento (misma escena, mismo formato de sesión).
- Todos los checks y e2e verdes.
