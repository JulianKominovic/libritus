# AGENTS.md — Libritus Infinite PDF Canvas

Context for agents working on this repo. Product vision and the optimal architecture live in [`docs/architecture/infinite-pdf-canvas.md`](docs/architecture/infinite-pdf-canvas.md). This file is the operational ground truth: what ships today, gaps vs the ideal, and conventions.

## Project meta

**Libritus** is an Electron desktop reading app. The PDF viewer is an **infinite canvas**: pages stacked in a column, whiteboard-style pan/zoom, free annotations on top (highlights, notes, arrows, freehand) via Excalidraw + native pdf.js.

Performance goal: PDFs with **3000+ pages** without degrading pan/zoom or render.

Guiding principle:

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations in page coordinates**.

---

## Features

### Done (v1 canvas)

| Feature | Where |
|---------|--------|
| Categories library + PDF upload (existing Libritus FS) | `stores/categories`, `integrations/fs` |
| Session per PDF (`{pdfId}.session.json`: elements + camera) | `PdfCanvasApp`, `lib/pdf-canvas/session` |
| Autosave debounce 5s + Saved/Unsaved + flush on leave | `PdfCanvasApp` |
| Open PDF from category → ArrayBuffer → pdf.js | `PdfCanvasApp`, `PdfDocument` |
| Column layout + gap | `PageLayout` |
| Virtualization: visible pages only (+ buffer) | `PagePool`, `PdfLayer` |
| Reusable pool + cancel off-screen renders | `PagePool` |
| Fixed-scale bitmap + CSS zoom (no re-raster on zoom) | `PdfRenderer`, `PdfLayer` |
| Text layer only on visible pages | `TextLayerPool` |
| “Select text” mode (pointer-events + manual wheel) | `PdfCanvasApp`, CSS |
| Selection → locked Excalidraw highlights | `selectionToHighlights` |
| Same-line rect dedupe | `mergeSameLineRects` |
| Click highlight → “Add note” chip + bound arrow | `PdfCanvasApp`, `selectionToHighlights` |
| Freehand / shapes / undo | Excalidraw built-in |
| Page navigation (prev/next, input, current page) | `PageNavigator`, `PageLayout`, `PdfCanvasApp` |

### Pending / roadmap

| Priority | Feature | Notes |
|----------|---------|--------|
| **v1.1** | Canonical annotation model (`pageIndex` + page-space geometry) | Today live in Excalidraw **scene coords** |
| **v1.1** | Migrate legacy highlights/comments/essays from `categories.json` | Old lector model — not wired to canvas |
| **v1.1** | Page-stable highlights | Bridge toward renderer migration |
| **v2** | Own camera + visual engine (Pixi or equivalent) | Camera is Excalidraw today |
| **v2** | Spatial annotation culling + index | `findPdfHighlightAt` is linear scan |
| **v2** | LOD / thumbnails | Single `FIXED_RENDER_SCALE = 2` |
| **v2+** | Hi-res tiles, HTTP range, OPFS | Open loads whole PDF into RAM |

See [`docs/roadmap.md`](docs/roadmap.md).

---

## Optimal architecture (destination)

Full detail: [`docs/architecture/infinite-pdf-canvas.md`](docs/architecture/infinite-pdf-canvas.md).

```
React (infrequent UI)           Frame loop (rAF)
─────────────────────           ────────────────
toolbar, file open              camera → visible pages
tool / selection UI             page pool + LOD textures
note editors (HUD DOM)          annotation cull + draw
```

- **Target stack**: pdf.js (worker) + Pixi (or own canvas) + mutable camera outside React + Zustand; metadata/thumbs on disk or IDB if needed.
- **Coords**: Screen ↔ World ↔ Page. Annotations **always** in page-space + `pageIndex`.
- **Hard rule**: **pan/zoom must not re-render React**.

---

## Current architecture (v1)

Electron + React. Excalidraw = camera + annotation tools. PDF = virtualized DOM layer **underneath**, not Excalidraw shapes.

```
src/main/                     # Electron main + IPC (read/write appData)
src/renderer/src/
  pages/pdf.tsx               # Route: mounts PdfCanvasApp
  organisms/pdf-canvas/
    PdfCanvasApp.tsx          # open, session, autosave, text-select, Excalidraw
    PdfLayer.tsx              # sync pools ↔ camera; CSS transform
    PageNavigator.tsx         # current / total, prev/next, jump
  lib/pdf-canvas/
    PdfDocument.ts            # pdf.js wrapper (0-based public API)
    PageLayout.ts             # Y stack + queryVisible + page nav helpers
    PagePool.ts               # canvas slots, LRU, cancel
    TextLayerPool.ts          # text layer slots
    PdfRenderer.ts            # fixed-scale render
    selectionToHighlights.ts  # DOM selection → Excalidraw elements
    session.ts                # SessionSnapshot + read/write helpers
    types.ts
    textLayer.css
  stores/categories.ts        # library catalog (categories.json + {id}.pdf)
```

### Flow

1. Category → open PDF → `readFile` → `PdfDocument` → `PageLayout` + pools.
2. If `{pdfId}.session.json` exists: restore elements + camera; else initial camera.
3. Excalidraw `onScrollChange` / `onChange` → dirty → debounce 5s → session file.
4. `PdfLayer`: world AABB → `layout.queryVisible` → `pool.syncVisible` / `textPool.syncVisible`.
5. Zoom: same texture; only `translate * zoom` + `scale(zoom)`.
6. Highlights: Excalidraw rects with `customData.pdfHighlight`, `locked: true` — **still scene space**.

### Conscious gaps vs optimal

| Optimal | Today |
|---------|--------|
| Own camera / stage | Excalidraw is source of truth |
| Page-space annotations | Scene coords (session persists scene-space on purpose) |
| LOD / tiles | Fixed scale 2 |
| Render outside React reconcile | Camera can still drive PdfLayer updates |
| Spatial index | Linear element scan |

---

## Memory — diagnosis and levers

~1 GB with a large PDF is plausible in this v1: scale-2 canvases + aggressive buffer + whole PDF in RAM + text layers + Excalidraw.

Lowering only `DEFAULT_POOL_SIZE` (12→3) **barely helps** if the buffer still asks for N≫poolSize pages: both pools do `capacity = Math.max(poolSize, needed)`.

### Where RAM goes

| Source | What happens | Files |
|--------|--------------|-------|
| **Page bitmaps** | Each slot renders at `FIXED_RENDER_SCALE = 2`. Letter ≈ ~8 MB RGBA per page. | `PdfRenderer.ts`, `PagePool.ts` |
| **Visibility buffer** | `PdfLayer` expands AABB with viewport size / zoom. Zoom-out explodes the visible set. | `PdfLayer.tsx`, `PageLayout.queryVisible` |
| **Whole PDF in process** | Open = ArrayBuffer → `getDocument({ data })`. | `PdfDocument.ts`, `PdfCanvasApp` |
| **Metadata pass** | `getPage` for all pages for sizes — warms worker on huge docs. | `PdfDocument.open` |
| **Text layers** | DOM TextLayer for each index in the visible/buffer set. | `TextLayerPool.ts` |
| **Excalidraw** | Scene + internal textures. | `PdfCanvasApp` |

### Levers (suggested priority)

1. Shrink `queryVisible` buffer (page-height based, not full viewport in all directions).
2. Hard cap visible set (e.g. 3–5 nearest to camera center).
3. Lower or LOD `FIXED_RENDER_SCALE` (2 → 1.5/1; later zoom-based LOD).
4. Release resources on evict (`canvas.width = 0`, `page.cleanup()`).
5. Text layer only in text-select mode or strict viewport.
6. Avoid loading entire PDF as ArrayBuffer (streaming / range / OPFS).
7. Metadata pass without retaining page proxies.
8. `poolSize` as soft cache only — after buffer + cap.

### What not to do as a “memory fix”

- Put PDF pages into the Excalidraw element store (breaks virtualization).
- Re-render pdf.js on every zoom tick.
- Raise `FIXED_RENDER_SCALE` for sharpness without LOD or visible cap.
- Assume lowering `DEFAULT_POOL_SIZE` alone is enough.

---

## Agent conventions

1. **Electron shell** — IPC via `integrations/fs`; PDFs live as `{pdfId}.pdf` in appData; catalog in `categories.json`. Always import pdf.js via `lib/pdf-canvas/pdfjs.ts` (legacy build) — Electron's Chromium may lack `Map.getOrInsertComputed` that pdf.js 6 needs.
2. **Never put PDF pages in the Excalidraw element store** — always the virtualized layer (`PagePool` / `PdfLayer`).
3. **When extending annotations**, prefer `pageIndex` + page coords (even if Excalidraw paints in scene). Avoid deepening the scene-only dead end.
4. **Heavy new resources** → same pool pattern: fixed slots, LRU, cancel, generation counter.
5. **Do not re-rasterize on every zoom** — fixed bitmap + CSS/camera transform, except future LOD threshold changes.
6. **`pageIndex` 0-based** in app; pdf.js 1-based only inside `PdfDocument.getPage`.
7. Pointer-events / text-select live in CSS — do not break pass-through.
8. Highlights: identity = `customData.pdfHighlight === true`; keep `locked`.
9. Code/comments in English; product docs may be Spanish.
10. Minimal scope: no refactors or deps “because optimal asks for them” unless the task requires it.
11. **Light mode only** — no `dark:` Tailwind prefixes.

---

## Troubleshooting

### Arrow highlight → note: disappears / re-anchors randomly

**Cause (two Excalidraw traps):**

1. Highlights are `locked: true`. Locked elements are not bindable for interactive rebind. If the arrow start is bound to the highlight, releasing a handle clears that binding.
2. Straight arrows rebind *both* ends when dragging one. Free start near the note snaps to the same note → zero-length arrow.

**Canonical fix** (in `createNoteFromHighlight` / `selectionToHighlights.ts`):

- Start **positioned** on highlight edge, **no** `startBinding`.
- End bound to the note (`endBinding` + note `boundElements`).
- Arrow **`elbowed: true`** with `fixedPoint` on the end. Elbows keep the non-dragged end as `"keep"`.

**Do not:** bind start to the locked highlight; or use a straight arrow with only end binding.

---

## Scripts

- `bun run dev` — Electron + electron-vite
- `bun run build` — typecheck + build
- `bun run build:mac` — packaged mac build
