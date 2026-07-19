# PDF text search

Find text inside the open PDF and jump the camera to matches.

**Status:** implemented (`PdfFindBar` + `pdfSearch` + `PdfLayer.setSearchHit`, wired in `PdfCanvasApp`).

---

## Product goals

1. Search the current document’s text (not annotations) from canvas chrome.
2. Cycle matches: next / previous; show `current / total` when there are hits.
3. Jump camera to the active match (same zoom / stable X as page nav) and briefly highlight the hit.
4. Work on large PDFs without loading every page’s text into React state up front.

Out of scope (for now):

- Search across the whole library / multiple PDFs.
- Regex / fuzzy search.
- Searching note `plateValue` or freehand (see [`annotation-panel.md`](annotation-panel.md)).
- Replacing text in the PDF.
- Keyboard shortcut to open find (chrome **Search** toggle only for now).

---

## UX

| Control | Behavior |
|---------|----------|
| **Search field** | Open via chrome **Search** button. Debounced query (~250ms). |
| **Enter / ↓** | Next match. |
| **⇧Enter / ↑** | Previous match. |
| **Escape** | Close find bar and clear active hit. |
| **Empty / no hits** | Clear match chrome; show `0/0`, not an error. |

Position: compact find bar beside the bottom page navigator. Do not bury in Excalidraw’s menu.

In `text-select-mode`, search chrome keeps `pointer-events-auto` like [`pdf-navigation.md`](pdf-navigation.md).

---

## Model / approach

- Source of truth for glyphs: pdf.js text content (`getTextContent`).
- **Lazy / incremental** index: `PdfTextSearch` caches page→extracted text on demand with concurrency 2; results stay in refs, not React state.
- Match = `{ pageIndex, rects[] }` in **page space**; painted via `PdfLayer.setSearchHit` under the same camera transform as pages.
- Jump: `PageLayout.scrollForWorldY` + Excalidraw `scrollY` only (stable X / zoom).

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **PDF navigation** | Search jumps camera; current page chip updates from viewport center. |
| **Virtualization** | Far jumps trigger the same pool sync as prev/next. |
| **Text select** | Independent modes; search must not require text-select mode. |
| **Annotation panel** | Different corpus (PDF text vs user marks). |

---

## Closed decisions

1. Per-open-PDF only.
2. Camera jump + ephemeral hit overlay; do not create Excalidraw elements for matches.
3. UI match count is 1-based; `pageIndex` stays 0-based internally.
4. Escape closes the find bar (does not keep a closed panel with lingering query chrome).
