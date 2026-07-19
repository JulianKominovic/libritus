# Annotation panel (“my work”)

Sidebar/panel listing the user’s highlights and notes for the open PDF, with jump-to on click.

**Status:** planned.

---

## Product goals

1. See all PDF highlights and WYSIWYG notes for the current document without hunting on the canvas.
2. Click a row → select the element and move the camera so it is in view.
3. Show enough preview to recognize the item (highlight snippet if available; note plain-text excerpt from `plateValue`).
4. Stay in sync with the live scene (create / delete / edit updates the list).

Out of scope (for now):

- Cross-document annotation inbox.
- Full-text search inside notes (can share UI chrome with [`pdf-search.md`](pdf-search.md) later).
- Editing note content inside the panel (jump + open on canvas / activate embed).
- Freehand / arbitrary shapes in v1 of the panel (highlights + `pdfNote` only).

---

## UX

| Control | Behavior |
|---------|----------|
| **List** | Group or filter: Highlights / Notes (or flat chronological). |
| **Row click** | Camera to element bounds; set `selectedElementIds`. |
| **Empty** | Short empty state (“No highlights yet”). |
| **Delete (optional)** | Same semantics as canvas: highlight Remove does not delete linked notes. |

Chrome: collapsible side panel; `pointer-events-auto` in text-select mode.

---

## Model / approach

- Source of truth: Excalidraw scene elements with `customData.pdfHighlight` / `customData.pdfNote` (see notes/highlight helpers).
- Derive list in a pure function from `elements` (filter `isDeleted`); do **not** keep a parallel annotation store.
- Jump: compute world AABB of the element → scroll camera (reuse layout/camera helpers). Avoid `setState` loops driven by Excalidraw `onChange` for geometry — list identity/content only.
- Note preview: strip Plate `plateValue` to plain text (small helper); truncate.

When page-space lands ([`page-space-annotations.md`](page-space-annotations.md)), list rows can show `pageIndex` and sort by document order.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **WYSIWYG notes** | Rows for `pdfNote`; click may select, not auto-enter edit. |
| **Highlights** | Rows for locked highlight rects; snippet from stored text if we add it, else “Highlight”. |
| **Sessions** | No separate file — scene already persists. |
| **Essays HUD** | Essays are a different surface; do not mix into this list until essays exist. |

---

## Closed decisions (draft)

1. Scene-derived list only (no second DB).
2. Jump + select; do not auto-activate note edit.
3. Highlights + notes first; shapes/arrows later if needed.
