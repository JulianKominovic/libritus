# PDF outline and thumbnails

Document structure chrome: PDF outline/bookmarks and a page thumbnail strip/sidebar so the user can orient in long documents.

**Status:** implemented (`PdfSidebar` + `pdfOutline` + `ThumbPool`, wired in `PdfCanvasApp`).

Product north ([`product-north.md`](product-north.md)): **destination** PDF sidebar = **navigation only** (Outline + Pages). Today `PdfSidebar` may also host Annotations and Chat; those are separate features. Outline/thumbs stay the nav core — do not remove them when Chat is retired later.

---

## Product goals

1. Show the PDF’s embedded outline (TOC) when present; clicking an entry jumps the camera to that destination.
2. Show a vertical (or strip) list of page thumbnails; click → jump to that page.
3. Keep outline/thumbs as **app chrome**, not Excalidraw scene elements.
4. Reuse existing page-nav jump helpers; do not duplicate camera math.

Out of scope (for now):

- User-created bookmarks stored in session (nice later; start with PDF outline + page index).
- Generating high-res thumbs for every page on open (use low-res / idle / LRU).
- Replacing the top-left page navigator ([`pdf-navigation.md`](pdf-navigation.md)).
- Changing Annotations / Chat tabs in this feature (leave as-is; Chat removal is later roadmap).

---

## UX

| Surface | Behavior |
|---------|----------|
| **Toggle** | Navbar panel-right + Settings `showPdfOutline`; right overlay when open. |
| **Outline** | Tree from pdf.js outline API. Missing outline → empty / hidden, not an error. |
| **Thumbnails** | One slot per page or virtualized list; active page marked from viewport center. |
| **Click item** | `goToPage` / destination scroll; same zoom + stable X as nav. |

In `text-select-mode`, panel chrome needs `pointer-events-auto`.

---

## Model / approach

### Outline

- Load via pdf.js document outline; destinations → `pageIndex` (+ optional Y in page space).
- Destinations that cannot resolve: skip or disable row; do not crash open.
- Jump today: page center via existing `goToPage` (dest Y deferred).

### Thumbnails

- Separate `ThumbPool` at `THUMB_SCALE = 0.25`, **not** the main `PagePool` bitmaps at `FIXED_RENDER_SCALE`.
- Hard-capped LRU + cancel; virtualized list drives `syncVisible`.
- Identity: `pageIndex` 0-based.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **PDF navigation** | Same jump primitives; thumbs/outline are discovery, nav is precise page number. |
| **PDF search** | Complementary: structure vs string match. |
| **Memory / pools** | Thumbs must not inflate the main page pool buffer. |
| **Sessions** | No need to persist outline; camera already restores position. |
| **Product north** | These tabs are the nav destination of the PDF sidebar. |

---

## Closed decisions (draft)

1. Prefer embedded PDF outline before inventing a custom bookmark store.
2. Thumbnails are chrome + cache, never Excalidraw images in the session.
3. Virtualize the thumb list for 3000+ page docs.
4. Outline + Pages remain when research tabs leave the sidebar later.
