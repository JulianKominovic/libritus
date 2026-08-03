# AGENTS.md — Libritus Infinite PDF Canvas

Context for agents working on this repo. **Product north** (research canvas): [`docs/features/product-north.md`](docs/features/product-north.md). Architecture: [`docs/architecture/infinite-pdf-canvas.md`](docs/architecture/infinite-pdf-canvas.md). This file is the operational ground truth: what ships today, gaps, and conventions.

## Project meta

**Libritus** is an Electron **research workspace**. Reading a PDF on an **infinite canvas** is the entry point; the canvas holds the investigation (notes, highlights, diagrams, and — destination — other study artifacts). Stack: **Excalidraw** + **PDFium** (`@embedpdf/engines` WASM), whiteboard-style pan/zoom. We are **not** building a custom camera / Pixi engine while Excalidraw works well.

Performance goal: PDFs with **3000+ pages** without degrading pan/zoom or render.

Guiding principles:

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations**.

> Research belongs on the **canvas**. AI only on **explicit ask** — do **not** build or promote auto-summarize, auto-highlight, or auto-keyword features.

---

## Features

### Done (v1 canvas)

| Feature                                                                                        | Where                                                                                                                                                 |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Categories library + PDF upload (existing Libritus FS)                                         | `stores/categories`, `integrations/fs`                                                                                                                |
| Session per PDF (`{pdfId}.session.json`: elements + camera)                                    | `PdfCanvasApp`, `lib/pdf-canvas/session`                                                                                                              |
| Autosave debounce 5s + Saved/Unsaved + flush on leave                                          | `PdfCanvasApp`                                                                                                                                        |
| Open PDF from category → ArrayBuffer → PDFium (EmbedPDF)                                       | `PdfCanvasApp`, `PdfDocument`                                                                                                                         |
| Column layout + gap + world-scale normalization                                                | `PageLayout`, `pageWorldScale`                                                                                                                        |
| Virtualization: visible pages only (+ buffer)                                                  | `PagePool`, `PdfLayer`                                                                                                                                |
| Reusable pool + cancel off-screen renders                                                      | `PagePool`                                                                                                                                            |
| Adaptive render density + CSS zoom (no re-raster on zoom)                                      | `PdfRenderer`, `renderScaleForWorld`, `PdfLayer`                                                                                                      |
| Text selection on visible pages (EmbedPDF SelectionLayer)                                      | `PdfLayer`, `@embedpdf/plugin-selection`                                                                                                              |
| Selection → locked Excalidraw highlights (+ HighlightToolbar)                                  | `selectionToHighlights` (`formattedSelectionToHighlightSkeletons`), `PdfCanvasApp` (selection-tool pass-through)                                      |
| Click highlight → “Add note” / “Buscar” / “Remove” chips (+ note/search arrows)                | `PdfCanvasApp`, `pdfNotes`, `pdfSearchCapture`                                                                                                        |
| Remove highlight cascades linked notes + search captures + arrows                              | `idsDeletedWithHighlight`, `PdfCanvasApp`                                                                                                             |
| WYSIWYG notes (Plate + `pdfNote` embeddable)                                                   | `NoteEmbed`, `pdfNotes`, `pdfNoteModel`                                                                                                               |
| Web search capture (Buscar / Place browser → guest WebContentsView → PNG as native image)      | `SearchCaptureEmbed`, `pdfSearchCapture`, `src/main/web-browser.ts`                                                                                   |
| Freehand / shapes / undo                                                                       | Excalidraw built-in                                                                                                                                   |
| Page navigation (prev/next, input, current page)                                               | `PageNavigator`, `PageLayout`, `PdfCanvasApp`                                                                                                         |
| PDF text search (find bar + jump + hit overlay; same-line rect dedupe)                         | `PdfFindBar`, `pdfSearch`, `mergeSameLineRects`, `PdfLayer.setSearchHit`, `PdfCanvasApp`                                                              |
| Outline + page thumbnails (sidebar)                                                            | `PdfSidebar`, `pdfOutline`, `ThumbPool`, `PdfCanvasApp`                                                                                               |
| Annotation panel (highlights + notes + searches list)                                          | `PdfSidebar` Annotations tab, `annotationList`, `PdfCanvasApp`                                                                                        |
| PDF RAG (local MiniLM + OpenRouter BYOK; Chat tab **unmounted**)                               | `PdfChatPanel`, `pdfRag`, `src/main/ai` (serial embed queue), `EmbeddingJobsIndicator`, Settings AI                                                   |
| Annotation polish: highlight color palette + delete note (keeps highlight) + Copiar on toolbar | `HighlightToolbar`, `selectionToHighlights` (`HIGHLIGHT_COLORS` / `setHighlightGroupColor`); note delete via Excalidraw + host `pdfNoteArrow` cleanup |

### Pending / roadmap

| Priority  | Feature                                                            | Notes                                                                                  |
| --------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| **v1.1**  | Finish annotation polish                                           | Copy selected PDF text without creating a highlight                                    |
| **v1.1**  | Optional page-space annotation model (`pageIndex` + page geometry) | Today live in Excalidraw **scene coords** (intentional); not a renderer-migration path |
| **v1.1**  | Migrate legacy highlights/comments/essays from `categories.json`   | Old lector model — not wired to canvas                                                 |
| **v1.1**  | Essays HUD / reading shortcuts / navigation history                | See feature specs                                                                      |
| **Scale** | Visible-set cap, LOD beyond Phase 1, evict release, streaming/OPFS | Stay on Excalidraw — see roadmap                                                       |
| **Later** | Canvas Q&A cards; nav-only PDF sidebar; retire Chat silo           | See [`product-north.md`](docs/features/product-north.md), roadmap                      |

See [`docs/roadmap.md`](docs/roadmap.md).

---

## Current architecture

Electron + React. **Excalidraw = camera + annotation tools.** PDF = virtualized DOM layer **underneath**, not Excalidraw shapes. Full write-up: [`docs/architecture/infinite-pdf-canvas.md`](docs/architecture/infinite-pdf-canvas.md).

```
src/main/                     # Electron main + IPC (read/write appData)
  web-browser.ts              # guest WebContentsView (search capture)
  web-browser-url.ts          # http(s) allowlist for guest nav
src/renderer/src/
  pages/pdf.tsx               # Route: mounts PdfCanvasApp
  organisms/pdf-canvas/
    PdfCanvasApp.tsx          # open, session, autosave, text select (selection tool), notes, search capture, Excalidraw
    NoteEmbed.tsx             # Plate inside Excalidraw renderEmbeddable
    SearchCaptureEmbed.tsx    # placeholder chrome for pdf-search-capture embeddable
    BrowserChrome.tsx         # back/forward/zoom/orientation over guest
    useSearchCaptureBrowser.ts # open/bounds/deactivate + promote PNG → image
    PdfLayer.tsx              # sync pools ↔ camera; CSS transform
    PageNavigator.tsx         # current / total, prev/next, jump
    PdfSidebar.tsx            # outline + virtualized page thumbs + annotations list
    PdfFindBar.tsx            # PDF text search chrome
  lib/pdf-canvas/
    embedpdfEngine.ts         # PDFium worker singleton + local wasm URL
    embedpdfPlugins.ts        # DocumentManager + InteractionManager + Selection (no Viewport)
    PdfDocument.ts            # EmbedPDF document wrapper (0-based public API)
    PageLayout.ts             # Y stack + queryVisible + page nav helpers
    pageWorldScale.ts         # world-scale normalize + renderScaleForWorld
    PagePool.ts               # canvas slots, LRU, cancel
    ThumbPool.ts              # hard-capped low-scale thumbs for sidebar
    PdfRenderer.ts            # renderPageRaw → canvas
    pdfOutline.ts             # bookmarks → pageIndex tree
    annotationList.ts         # scene → highlight/note list + plate plain text + canvasStats
    selectionToHighlights.ts  # EmbedPDF formatted selection → Excalidraw highlights
    pdfNotes.ts / pdfNoteModel.ts  # WYSIWYG notes (embeddable + plateValue)
    pdfSearchCapture.ts       # search capture model + arrow sync + promote-to-image
    session.ts                # SessionSnapshot + read/write helpers
    types.ts
  integrations/webBrowser.ts  # renderer IPC for guest browser
  stores/categories.ts        # library catalog (categories.json + {id}.pdf)
```

Feature docs (done): [`wysiwyg-notes`](docs/features/wysiwyg-notes.md), [`pdf-navigation`](docs/features/pdf-navigation.md), [`persistence-and-sessions`](docs/features/persistence-and-sessions.md), [`pdf-search`](docs/features/pdf-search.md), [`outline-and-thumbnails`](docs/features/pdf-outline-and-thumbnails.md), [`annotation-panel`](docs/features/annotation-panel.md), [`pdf-rag-chat`](docs/features/pdf-rag-chat.md) (Chat hidden), [`web-search-capture`](docs/features/web-search-capture.md), [`annotation-polish`](docs/features/annotation-polish.md), [`adaptive-pdf-render-scale`](docs/features/adaptive-pdf-render-scale.md) (Phase 1).

Feature docs (planned): [`reading-shortcuts`](docs/features/reading-shortcuts.md), [`essays-hud`](docs/features/essays-hud.md), [`page-space-annotations`](docs/features/page-space-annotations.md) (optional), [`legacy-migration-and-export`](docs/features/legacy-migration-and-export.md), [`navigation-history`](docs/features/navigation-history.md).

### Flow

1. Category → open PDF → `readFile` → `PdfDocument` → `PageLayout` + pools.
2. If `{pdfId}.session.json` exists: restore elements + camera; else initial camera.
3. Excalidraw `onScrollChange` / `onChange` → dirty → debounce 5s → session file.
4. `PdfLayer`: world AABB → `layout.queryVisible` → `pool.syncVisible` (+ EmbedPDF `SelectionLayer` per visible page).
5. Zoom: same texture; only `translate * zoom` + `scale(zoom)`.
6. Highlights: Excalidraw rects with `customData.pdfHighlight`, `locked: true` — **scene space** (from EmbedPDF `getFormattedSelection()`).
7. Notes: Excalidraw **embeddables** with `customData.pdfNote` + `plateValue` (solid fill); Plate via `renderEmbeddable` / `NoteEmbed` (see wysiwyg-notes doc).
8. Search captures: placeholder embeddable → guest `WebContentsView` on activate → PNG in `attachments/` → native Excalidraw `image` (see web-search-capture doc).

### Conscious gaps (improve on Excalidraw)

| Gap                                | Today                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Page-space annotations             | Scene coords (session persists scene-space on purpose)                                                                                                                                                                                                                                                                                                                                                            |
| LOD / tiles                        | Adaptive density Phase 1 (`renderScaleForWorld`); no zoom-based LOD yet                                                                                                                                                                                                                                                                                                                                           |
| Camera outside React               | Excalidraw owns camera; host syncs pools via refs                                                                                                                                                                                                                                                                                                                                                                 |
| Spatial index                      | Linear element scan (`findPdfHighlightAt`)                                                                                                                                                                                                                                                                                                                                                                        |
| Whole PDF in RAM                   | Open = ArrayBuffer → `openDocumentBuffer`                                                                                                                                                                                                                                                                                                                                                                         |
| Native text edit off-screen growth | Editing Excalidraw text, pan so it leaves the viewport, then type → container can grow/overflow via WYSIWYG `scrollIntoView` ([upstream #8936](https://github.com/excalidraw/excalidraw/issues/8936)). **Do not** host-mitigate or patch Excalidraw — wait for [#11056](https://github.com/excalidraw/excalidraw/pull/11056) (or successor) to land and bump `@excalidraw/excalidraw` when a release includes it. |

---

## Memory — diagnosis and levers

~1 GB with a large PDF is plausible: page bitmaps + buffer + whole PDF in RAM + Excalidraw.

Lowering only `DEFAULT_POOL_SIZE` (12→3) **barely helps** if the buffer still asks for N≫poolSize pages: both pools do `capacity = Math.max(poolSize, needed)`.

### Where RAM goes

| Source                   | What happens                                                                                                                                                  | Files                                                |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Page bitmaps**         | Each slot renders at `renderScaleForWorld(worldScale)` (~`TARGET_WORLD_DENSITY` = 2 device px per world CSS px, clamped). Letter ≈ ~8 MB RGBA per page at 2×. | `PdfRenderer.ts`, `pageWorldScale.ts`, `PagePool.ts` |
| **Visibility buffer**    | `PdfLayer` expands AABB with viewport size / zoom. Zoom-out explodes the visible set.                                                                         | `PdfLayer.tsx`, `PageLayout.queryVisible`            |
| **Whole PDF in process** | Open = ArrayBuffer → `openDocumentBuffer`.                                                                                                                    | `PdfDocument.ts`, `PdfCanvasApp`                     |
| **Metadata pass**        | `getPage` for all pages for sizes — warms worker on huge docs.                                                                                                | `PdfDocument.open`                                   |
| **Text selection**       | EmbedPDF SelectionLayer glyph overlays for visible pages (not DOM text spans).                                                                                | `PdfLayer.tsx`, `@embedpdf/plugin-selection`         |
| **Excalidraw**           | Scene + internal textures.                                                                                                                                    | `PdfCanvasApp`                                       |

### Levers (suggested priority)

1. Shrink `queryVisible` buffer (page-height based, not full viewport in all directions).
2. Hard cap visible set (e.g. 3–5 nearest to camera center).
3. Zoom-based LOD beyond Phase 1 adaptive density (see [`adaptive-pdf-render-scale.md`](docs/features/adaptive-pdf-render-scale.md)).
4. Release resources on evict (`canvas.width = 0`, `page.cleanup()`).
5. Text layer only in strict viewport (always hittable under selection-tool pass-through).
6. Avoid loading entire PDF as ArrayBuffer (streaming / range / OPFS).
7. Metadata pass without retaining page proxies.
8. `poolSize` as soft cache only — after buffer + cap.

### What not to do as a “memory fix”

- Put PDF pages into the Excalidraw element store (breaks virtualization).
- Re-rasterize PDFium pages on every zoom tick.
- Raise render density for sharpness without LOD or visible cap.
- Assume lowering `DEFAULT_POOL_SIZE` alone is enough.
- Build a second canvas engine “for performance” without measuring Excalidraw as the bottleneck.

---

## Agent conventions

1. **Electron shell** — IPC via `integrations/fs`; PDFs live as `{pdfId}.pdf` in appData; catalog in `categories.json`. PDF engine via `lib/pdf-canvas/embedpdfEngine.ts` (`@embedpdf/engines` + local `public/wasm/pdfium.wasm`). Do not use EmbedPDF Viewport/Scroller — Excalidraw owns the camera.
2. **Never put PDF pages in the Excalidraw element store** — always the virtualized layer (`PagePool` / `PdfLayer`).
3. **When extending annotations**, prefer `pageIndex` + page coords when adding new durable geometry (even if Excalidraw paints in scene). Do not deepen scene-only blindly — but scene-space sessions remain valid until page-space lands.
4. **Heavy new resources** → same pool pattern: fixed slots, LRU, cancel, generation counter.
5. **Do not re-rasterize on every zoom** — fixed/adaptive bitmap + CSS/camera transform, except future LOD threshold changes.
6. **`pageIndex` 0-based** in app (PDFium page indexes are already 0-based).
7. Pointer-events / text pass-through (`.pdf-text-pass`) live in CSS — do not break selection-tool miss → EmbedPDF `PagePointerProvider`.
8. Highlights: identity = `customData.pdfHighlight === true`; keep `locked`.
9. Notes: identity = `customData.pdfNote === true`; solid fill (never transparent); geometry via Excalidraw / DOM, not React state on `onChange`.
10. Code/comments in English; product docs may be Spanish.
11. Minimal scope: no refactors or deps “because optimal asks for them” unless the task requires it. **Do not** propose Pixi / own-camera rewrites by default.
12. **Light mode only** — no `dark:` Tailwind prefixes.
13. **Never patch Excalidraw** — no `node_modules` edits, `patch-package`, postinstall hacks, or local forks for bugs. Mitigate in the host (events, wrappers, public props) or live with it / upstream.
14. **Product north** — prefer canvas artifacts for lasting research; do not invent auto-summarize / auto-highlight / auto-keyword AI. Sidebar Chat is hidden/legacy (do not deepen that silo). Destination: PDF sidebar = nav only.
15. **EmbedPDF**: engines + SelectionPlugin under Excalidraw are OK; do **not** mount Viewport / Scroller / RenderLayer.

---

## Troubleshooting

### Arrow highlight → note: disappears / re-anchors randomly

**Cause (two Excalidraw traps):**

1. Highlights are `locked: true`. Locked elements are not bindable for interactive rebind. If the arrow start is bound to the highlight, releasing a handle clears that binding.
2. Straight arrows rebind _both_ ends when dragging one. Free start near the note snaps to the same note → zero-length arrow.

**Canonical fix** (in `createNoteFromHighlight` / `pdfNotes.ts`):

- Start **positioned** on highlight edge; arrow stores `startX`/`startY` in `customData`.
- **No** Excalidraw `startBinding` / `endBinding` / note `boundElements` for the connector.
- Arrow **straight**, **`locked: true`**, `customData.pdfNoteArrow` + `noteId`; host syncs via `syncPdfNoteArrows` on scene change.
- One-sided Excalidraw bindings (elbow or straight) explode (~1e5px) when the note embeddable moves.

**Do not:** bind either end via Excalidraw; or use elbow routing for highlight→note connectors.

### Note center not draggable (borders work)

**Cause:** placeholder `backgroundColor: 'transparent'` — Excalidraw hit-tests stroke only. Also: embeddables activate on **center click** — drag from the **edge**.

**Fix:** solid `NOTE_FILL` (`#fff3bf`); `normalizePdfNote` on session restore. See [`docs/features/wysiwyg-notes.md`](docs/features/wysiwyg-notes.md).

### `Maximum update depth` when dragging a note

**Cause:** `onChange` → `setState` with geometry (or any value that changes every frame). Do not rebuild a parallel note HUD.

**Fix:** notes are embeddables — Excalidraw owns transform; React state only for note content writes via `withNotePlateValue`.

---

## Testing

- **Unit:** `*.test.ts` next to pure logic; run with `bun test` (`bun:test`). Prefer this over selfchecks.
- **E2E:** `e2e/**/*.spec.ts` with Playwright `_electron` against a production build. Isolate data via `LIBRITUS_APP_DATA_DIR`. Run `bun run test:e2e` (builds first).
- **Canvas coverage (canonical):** unit — `pdfNotes`, `pdfHighlightModel` / `sceneHit` hit-tests, `pdfSearchCapture`, `session` parse, `sessionPersist` dirty gate, `sessionOpen` apply gate, `PageLayout`, `mergeSameLineRects`, `selectionToHighlights` (`formattedSelectionToHighlightSkeletons`), `PagePool` (incl. gen abort), `ThumbPool`, `visibilityBuffer`, `pdfSearch`, `pdfOutline`, `annotationList`, `pdfRag`, `ragIndexQueue`, `pageWorldScale` / `renderScaleForWorld`. E2E — `session.spec`, `notes.spec`, `web-search-capture.spec`, `highlights.spec` (EmbedPDF drag-select + toolbar; no `.textLayer`), `autosave.spec`, `canvas-stats.spec`, `open-race.spec`, `quit-flush.spec`, `pdf-canvas.spec`, `search.spec`, `outline-thumbs.spec`, `annotation-panel.spec`, `rag-chat.spec`. Helpers: `e2e/helpers/seed.ts`, `e2e/helpers/canvas.ts` (`dragSelectPdfPage`, `expectSaved` / `expectUnsaved`).
- Do not add Vitest/Jest. Do not add new `*.selfcheck.ts` files.

## Scripts

- `bun run dev` — Electron + electron-vite
- `bun run build` — typecheck + build
- `bun run build:mac` — packaged mac build
- `bun test` — unit tests
- `bun run test:e2e` — Playwright Electron e2e (builds first)
- `bun run test:all` — unit + e2e
