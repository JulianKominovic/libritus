# Reading shortcuts

Keyboard and quick zoom affordances for comfortable continuous reading on the infinite canvas.

**Status:** planned.

---

## Product goals

1. Move through the document without relying only on the page navigator chips.
2. Fit the page (or page width) to the viewport with one action.
3. Zoom in/out in predictable steps without breaking PDF virtualization (still CSS/camera zoom, no re-raster).

Out of scope (for now):

- Full custom keymap UI / user-remappable bindings.
- Vim-style modes.
- Changing `FIXED_RENDER_SCALE` on zoom (LOD is a separate roadmap item).

---

## UX

| Shortcut / action | Behavior |
|-------------------|----------|
| **PageDown / Space** | Next page (same as nav ▶). |
| **PageUp / ⇧Space** | Previous page. |
| **Home / End** (optional) | First / last page. |
| **Fit page** | Zoom + scroll so the current page fits in the viewport. |
| **Fit width** | Zoom so page width matches viewport width; keep vertical reading position. |
| **Zoom ±** | Step zoom (e.g. ±10%); center on viewport center. |
| **Ctrl/Cmd + 0** | Reset to a default reading zoom (define constant). |

Ignore shortcuts while typing in note edit, page-nav input, search field, or other focused inputs.

In `text-select-mode`, wheel may already be manual — shortcuts must still call the same camera update path as Excalidraw scroll/zoom.

---

## Model / approach

- All actions mutate Excalidraw camera (`scrollX` / `scrollY` / `zoom`) via the same helpers as [`pdf-navigation.md`](pdf-navigation.md).
- Fit math uses `PageLayout` page bounds + viewport size from the Excalidraw API / container.
- Do not re-render pdf.js textures on zoom.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **PDF navigation** | Shortcuts are accelerators over the same `goToPage` / camera helpers. |
| **PDF search** | Search owns Enter for next-match when find UI is focused. |
| **Text select / notes** | Focus gating so editing is not interrupted. |
| **Sessions** | Camera changes dirty + autosave as today. |

---

## Closed decisions (draft)

1. Build on existing nav helpers; no parallel “reader mode” camera.
2. Fit page / fit width are explicit actions, not automatic on open (session camera wins on restore).
