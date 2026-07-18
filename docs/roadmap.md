# Roadmap — Infinite PDF Canvas

North star for migrating Libritus from the classic lector viewer to a scalable infinite canvas. Architecture detail: [`docs/architecture/infinite-pdf-canvas.md`](architecture/infinite-pdf-canvas.md). Agent conventions: [`AGENTS.md`](../AGENTS.md).

---

## v1 (current MVP)

- Replace lector-based `/category/:categoryId/:pdfId` with Excalidraw + virtualized pdf.js layer.
- Page pool, fixed-scale raster + CSS zoom, text select, locked highlights, notes + arrows.
- Page navigator.
- Session autosave: `{pdfId}.session.json` (elements + camera).
- Keep existing categories library / upload / Electron FS.

**Explicitly deferred in v1:** legacy highlight margin UI, essays tab, outline/search chrome, Wikipedia selection menu, removing `@anaralabs/lector` from dependencies.

---

## v1.1

| Item | Notes |
|------|--------|
| Canonical annotation model | `pageIndex` + page-space geometry; Excalidraw remains paint layer |
| Stable page-anchored highlights | Bridge toward non-Excalidraw renderer |
| Migrate legacy data | Map old `categories.json` highlights/comments into canvas session or canonical store |
| Essays / outline | Reintroduce as canvas HUD or side panels without lector |
| Library polish | Optional `contentHash`, rename, reveal in Finder |

---

## v2

| Item | Notes |
|------|--------|
| Own camera + visual engine | Pixi (or Canvas2D) — Excalidraw optional for tools only or replaced |
| Spatial annotation index | Cull and hit-test without linear scans |
| LOD / thumbnails | Zoom-based resolution; idle thumbnail generation |
| Hard visible-set cap | Memory budget independent of zoom-out buffer |
| Evict release | Zero canvas buffers / `page.cleanup()` on pool evict |

---

## v2+

| Item | Notes |
|------|--------|
| Hi-res tiles | Avoid giant GPU textures at high zoom |
| Streaming / range / OPFS | Do not keep entire PDF ArrayBuffer in main forever |
| Markdown blocks on canvas | See experimental `docs/features/markdown-editor.md` if revisited |
| Visual polish | Product chrome; avoid regressing performance |

---

## Migration debt (from lector era)

These still exist in the codebase / `categories.json` but are **not** wired into the canvas MVP:

- `Pdf.highlights` / comments / margin layout (`comment-margin-layer`, `custom-highlight-layer`)
- Essays (Plate) on the PDF sheet
- Lector `Root` / `Pages` / selection menu / floating zoom controls
- Progress as scroll `offset` (replaced by session camera for canvas)

Plan: treat session JSON as the write path for new annotations; one-shot or lazy migrate legacy highlights when touching a document in v1.1.

---

## Guiding principle

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations in page coordinates**.

Ship v1 on Excalidraw; migrate renderer when page count and annotation volume demand it — without rewriting the document model if page-space was adopted early.
