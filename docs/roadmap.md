# Roadmap — Infinite PDF Canvas

North star for migrating Libritus from the classic lector viewer to a scalable infinite canvas. Architecture detail: [`docs/architecture/infinite-pdf-canvas.md`](architecture/infinite-pdf-canvas.md). Agent conventions: [`AGENTS.md`](../AGENTS.md).

---

## v1 (current MVP)

- Replace lector-based `/category/:categoryId/:pdfId` with Excalidraw + virtualized pdf.js layer.
- Page pool, fixed-scale raster + CSS zoom, text select, locked highlights.
- WYSIWYG notes (Plate HUD + `pdfNote` placeholders; place free or from highlight).
- Page navigator.
- Session autosave: `{pdfId}.session.json` (elements + camera).
- Keep existing categories library / upload / Electron FS.

**Explicitly deferred in v1:** outline/search chrome; reintroducing essays as a canvas HUD (legacy essays UI removed with lector).

Feature write-up: [`docs/features/wysiwyg-notes.md`](features/wysiwyg-notes.md).

---

## v1.1

Feature specs (planned): [`outline-and-thumbnails`](features/pdf-outline-and-thumbnails.md) · [`annotation-panel`](features/annotation-panel.md) · [`reading-shortcuts`](features/reading-shortcuts.md) · [`essays-hud`](features/essays-hud.md) · [`annotation-polish`](features/annotation-polish.md) · [`page-space-annotations`](features/page-space-annotations.md) · [`legacy-migration-and-export`](features/legacy-migration-and-export.md).

Done in v1.1 so far: [`pdf-search`](features/pdf-search.md).

| Item | Notes |
|------|--------|
| Canonical annotation model | `pageIndex` + page-space geometry; Excalidraw remains paint layer — [`page-space-annotations.md`](features/page-space-annotations.md) |
| Stable page-anchored highlights | Bridge toward non-Excalidraw renderer |
| Migrate legacy data | Map old `categories.json` highlights/comments into canvas session or canonical store — [`legacy-migration-and-export.md`](features/legacy-migration-and-export.md) |
| Essays / outline | Reintroduce as canvas HUD or side panels without lector — [`essays-hud.md`](features/essays-hud.md), [`pdf-outline-and-thumbnails.md`](features/pdf-outline-and-thumbnails.md) |
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

Legacy shapes may still appear in `categories.json` but are **not** written by the canvas MVP:

- `Pdf.highlights` / comments / essays (typed in the store for load/display/mentions; migration to session/canonical model is v1.1)
- Progress as scroll `offset` (replaced by session camera for canvas)

Plan: treat session JSON as the write path for new annotations; one-shot or lazy migrate legacy highlights when touching a document in v1.1.

---

## Guiding principle

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations in page coordinates**.

Ship v1 on Excalidraw; migrate renderer when page count and annotation volume demand it — without rewriting the document model if page-space was adopted early.
