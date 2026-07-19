# PDF text search

Find text inside the open PDF and jump the camera to matches.

**Status:** planned.

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

---

## UX

| Control | Behavior |
|---------|----------|
| **Search field** | Open via chrome (and later shortcut). Debounced query. |
| **Enter / ↓** | Next match. |
| **⇧Enter / ↑** | Previous match. |
| **Escape** | Clear active hit chrome; keep query or close panel (pick one in impl). |
| **Empty / no hits** | Clear match chrome; show empty state, not an error. |

Position: overlay near existing nav (top) or a compact find bar — do not bury in Excalidraw’s menu.

In `text-select-mode`, search chrome must keep `pointer-events-auto` like [`pdf-navigation.md`](pdf-navigation.md).

---

## Model / approach

- Source of truth for glyphs: pdf.js text content (`getTextContent` / existing text-layer path).
- Prefer **lazy / incremental** index: search visible + nearby pages first, or build a page→string map on demand with a hard concurrency limit.
- Match = `{ pageIndex, rects[] }` in **page space** when possible (aligns with [`page-space-annotations.md`](page-space-annotations.md)); paint overlay in scene/screen via the same camera transform as `PdfLayer`.
- Jump: reuse `PageLayout` camera helpers (`scrollForPageCenter` / rect-aware scroll). Do not invent a second navigator.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **PDF navigation** | Search jumps camera; current page chip updates from viewport center. |
| **Virtualization** | Far jumps trigger the same pool sync as prev/next. |
| **Text select** | Independent modes; search must not require text-select mode. |
| **Annotation panel** | Different corpus (PDF text vs user marks). |

---

## Closed decisions (draft)

1. Per-open-PDF only.
2. Camera jump + ephemeral hit overlay; do not create Excalidraw elements for matches.
3. UI match count is 1-based; `pageIndex` stays 0-based internally.
