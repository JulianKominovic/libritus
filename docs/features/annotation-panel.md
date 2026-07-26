# Annotation panel (“my work”)

Sidebar/panel listing the user’s highlights and notes for the open PDF, with jump-to on click.

**Status:** implemented (`PdfSidebar` Annotations tab + `annotationList`, wired in `PdfCanvasApp`).

Product north ([`product-north.md`](product-north.md)): lasting research lives on the **canvas**; the destination PDF sidebar is **navigation only**. This panel is a **scene-derived jump index** (not a content store). Hosting it in `PdfSidebar` is fine for now; any relocate off the nav sidebar is **later** roadmap — do not treat a move as required for current work.

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
- Delete from the panel (use canvas Remove).
- Relocating the list off `PdfSidebar` (destination / later only).

---

## UX

| Control | Behavior |
|---------|----------|
| **Toggle** | Navbar panel-right button (and Settings → “Show PDF sidebar”); panel on the right. |
| **Tab** | Outline / Pages / Annotations (shared Tabs UI). |
| **List** | Flat list sorted by scene Y then X; kind label + truncated preview. |
| **Row click** | Camera to element center; set `selectedElementIds` (no auto-edit). |
| **Empty** | “No highlights or notes yet.” |

Chrome: right overlay sidebar (`pointer-events-auto` in text-select mode).

---

## Model / approach

- Source of truth: Excalidraw scene elements with `customData.pdfHighlight` / `customData.pdfNote`.
- Multi-line text selection stamps a shared `customData.groupId` on every highlight rect → one list row, one Remove target, one logical highlight for stats.
- Derive list in `listAnnotations` (filter `isDeleted`, dedupe highlights by `groupId`); do **not** keep a parallel annotation store.
- React list updates gated by `annotationsSignature` (id / kind / preview only — not geometry).
- Jump: element AABB center → `scrollX` / `scrollY` + select.
- Note preview: `platePlainText(plateValue)` truncated.

When page-space lands ([`page-space-annotations.md`](page-space-annotations.md)), list rows can show `pageIndex` and sort by document order.

---

## Relation to other features

| Feature | Interaction |
|---------|----------|
| **WYSIWYG notes** | Rows for `pdfNote`; click selects, does not auto-enter edit. |
| **Highlights** | One row per `groupId` (multi-line selection = one unit); snippet from `customData.text`. |
| **Web search capture** | Not listed here (canvas image / embed artifact). Catalog count is `canvasStats.searches` — see [`web-search-capture.md`](web-search-capture.md). |
| **Sessions** | No separate file — scene already persists. |
| **Essays HUD** | Essays are a different surface; do not mix into this list until essays exist. |

---

## Closed decisions

1. Scene-derived list only (no second DB).
2. Jump + select; do not auto-activate note edit.
3. Highlights + notes first; shapes/arrows later if needed.
4. Third tab on `PdfSidebar` (not a separate panel); toggle via navbar / settings. Leave as-is until a later nav-only-sidebar pass.
