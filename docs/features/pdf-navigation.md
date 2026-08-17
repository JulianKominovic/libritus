# PDF Navigation

Page navigator chrome for the infinite canvas: current page, total, prev/next, and jump-by-input.

**Status:** implemented in `PageNavigator` + `PageLayout` helpers + wired in `PdfCanvasApp`.

---

## Product goals

1. While a PDF is open, show on the **left** of the top chrome:
   ```
   [◀] [current_page] / [total] [▶]
   ```
2. `current_page` is an editable input reflecting the primary viewport page; jump on Enter / blur.
3. Prev / next move the camera to the adjacent page (same zoom, stable X).
4. Without an open session, the control is hidden.

Out of scope (for this feature):

- Page thumbnails / outline — shipped separately as [`pdf-outline-and-thumbnails.md`](pdf-outline-and-thumbnails.md).
- PageUp/PageDown / “fit page” shortcuts — [`reading-shortcuts.md`](reading-shortcuts.md).
- In-memory jump history popover — [`navigation-history.md`](navigation-history.md).
- Persisting “last page” separately from camera (camera already covers position).

---

## UX

| Control   | Behavior                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------ |
| **◀**     | Go to `currentPage - 1`. Disabled on page 1.                                                           |
| **Input** | Shows `1…N` (1-based). On confirm: clamp and jump. While editing, scroll must not overwrite the draft. |
| **/ N**   | Read-only; `N = doc.pageCount`.                                                                        |
| **▶**     | Go to `currentPage + 1`. Disabled on last page.                                                        |

Position: absolute overlay **top-left** (`left-3 top-3`, high `z`), mirror of the right-side tool chips. Do not use Excalidraw `renderTopRightUI` for this.

In `text-select-mode` Excalidraw’s interactive layer is `pointer-events-none`; the nav overlay must re-enable hits (`pointer-events-auto`).

---

## Model / coords

- App: `pageIndex` **0-based** (PDFium page indexes are already 0-based).
- Nav UI: **1-based** (`displayPage = pageIndex + 1`).

### Current page derivation

**Primary rule:** page that contains the **viewport center** in world-space.

Fallback if the center falls in a gap: **nearest** page by vertical distance (avoids flicker).

Do **not** use “first of `queryVisible`” — with buffer/zoom-out many pages are visible; center matches Preview/Acrobat.

### Draft vs live on the input

| Mode        | Behavior                                                                        |
| ----------- | ------------------------------------------------------------------------------- |
| **Live**    | Input shows `currentPageIndex + 1` from camera.                                 |
| **Editing** | On focus, freeze local `draft`. Scroll does not overwrite.                      |
| **Commit**  | Enter or blur → parseInt → clamp `[1, pageCount]` → `goToPage` → leave editing. |
| **Cancel**  | Escape → discard draft, return to live.                                         |

### Jump (`goToPage`)

Mutate camera via Excalidraw `updateScene` (`scrollX`/`scrollY`/`zoom`).

**Scroll policy:** center-align the page in the viewport (implementation in `PageLayout.scrollForPageCenter` / equivalent). Keep current zoom and scrollX unless helpers say otherwise.

Prev/next = `goToPage(current ± 1)` with clamp; no wrap.

### Internal PDF link annotations

Clickable LINK annots (TOC / cross-refs) with an internal destination or Goto action jump via the same `goToPage` (page center; dest Y deferred, same as outline). http(s) URI actions open the in-app browser (`browser:show`). Loaded per visible page via EmbedPDF `getPageAnnotations` (`pdfLinks` + hit overlays in `PdfLayer`; host `handlePointerDown` for non-pass-through tools). mailto / javascript / file / RemoteGoto are ignored.

---

## Helpers (`PageLayout`)

| Helper                              | Role                            |
| ----------------------------------- | ------------------------------- |
| `pageIndexAtWorldPoint(x, y)`       | Binary search Y + hit / nearest |
| `pageIndexForCamera(camera)`        | Viewport center → index         |
| `scrollForPageTop` / center helpers | Jump targets                    |

`queryVisible` remains for the pool; nav does **not** depend on the virtualization buffer.

---

## Relation to other features

| Feature                             | Interaction                                                                                         |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Persistence / sessions**          | Jump changes `scrollY` → same `camera` saved in session JSON. No separate `pageIndex` field needed. |
| **Virtualization**                  | Jump far: `PdfLayer` syncVisible + pool cancel/render like a normal pan.                            |
| **Page-space annotations (future)** | Nav only moves camera; does not touch elements.                                                     |

---

## Closed decisions

1. Own left overlay, not Excalidraw top-left API (does not exist).
2. Current page = viewport center (nearest in gaps).
3. UI 1-based; internal 0-based.
4. No wrap on prev/next.
5. Note: Excalidraw hamburger menu may overlap top-left — shift nav if needed visually.
