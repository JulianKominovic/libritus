# Infinite PDF Canvas — Architecture

How the infinite PDF canvas is built today. **Product why** (research canvas, canvas owns research, AI subordinate): [`docs/features/product-north.md`](../features/product-north.md). Operational ground truth: [`AGENTS.md`](../../AGENTS.md).

Performance goal: PDFs with **3000+ pages** without degrading pan/zoom or render.

## Product vision

Libritus is a **research workspace**: the PDF triggers investigation; the infinite canvas holds the memory of that work (notes, diagrams, Q&A, links, free annotations). Full premises: [`product-north.md`](../features/product-north.md).

Canvas shape (how the workspace is laid out):

- The PDF is the axis of the canvas: pages stacked in a column across infinite space.
- Continuous reading with free pan/zoom (whiteboard style, not classic PDF scroll).
- Annotation / research layer on top: notes, highlights, arrows, freehand, web search captures, and (destination) other study artifacts.
- Coordinates today are Excalidraw **scene space** (session persists scene-space on purpose). Page-space (`pageIndex` + page geometry) remains an optional stability upgrade — see [`page-space-annotations.md`](../features/page-space-annotations.md).
- **Destination chrome:** PDF sidebar = outline + page thumbs only; lasting research lives on the canvas, not in research sidebars.

---

## Current architecture (Excalidraw + virtualized pdf.js)

Excalidraw is the **camera and annotation surface**. We are **not** planning a custom visual engine (Pixi / own canvas) while Excalidraw continues to work well. Scale and memory work stays in the **host**: page culling, pools, render density, and session model — not a renderer rewrite.

| Layer | Technology | Role |
|-------|------------|------|
| App / shell | Electron + Vite + React + TypeScript | Toolbar, library, side panels, settings |
| PDF | `pdfjs-dist` (worker, via `lib/pdf-canvas/pdfjs.ts`) | Parse, `getPage`, render to canvas |
| Canvas + tools | **Excalidraw** | Camera, freehand, shapes, undo, embeddables |
| PDF layer | Virtualized DOM under Excalidraw | `PageLayout` + `PagePool` / `TextLayerPool` / `PdfLayer` |
| UI state | React + Zustand (settings, categories) | Tools chrome, library, prefs |
| Persistence | Disk (appData) | `{pdfId}.pdf`, `{pdfId}.session.json`, `attachments/` |

### Integration approach

- Excalidraw as annotation and interaction surface.
- PDF as a **virtualized background** under Excalidraw (not 3000 native shapes).
- Only visible pages (+ buffer) rasterize.
- Highlights / notes / search captures are Excalidraw elements with `customData` identity (`pdfHighlight`, `pdfNote`, `pdfSearchCapture`).

### React vs camera updates

```
React (infrequent UI)           Host sync (onScrollChange / onChange)
─────────────────────           ────────────────────────────────────
toolbar, modals                 camera → PdfLayer → queryVisible
file picker                     page / text / thumb pools
tool / selection chrome         CSS transform (no re-raster on zoom)
note / search embeds            host arrow sync, session dirty
```

Rule of thumb: **pan/zoom should not rebuild React state for geometry**. Prefer refs + imperative DOM (highlight toolbar, browser chrome) over `setState` from every Excalidraw `onChange`.

### Coordinate system (today)

| Space | Description |
|-------|-------------|
| **Screen** | Viewport pixels (`clientX/Y`) |
| **Scene / world** | Excalidraw plane (`scrollX` / `scrollY` / `zoom`) |
| **Page** | Local to a page via `PageLayout` (used for visibility, search hits, thumbs) |

PDF layout in world space (column):

```
pageGap = 24  // world units
page[i].y = sum(page[0..i-1].height) + i * pageGap
page[i].x = 0
page[i].width / height = PDF viewport × worldScale
```

Annotations (highlights, notes, captures) live in **scene coords** in the session. Search-hit overlays already use page-space rects for drawing.

### PDF pipeline

1. **Open**: `readFile` → `getDocument({ data })` in worker.
2. **Metadata pass**: sizes for each page → `PageLayout` (+ `pageWorldScale`).
3. **Visible set**: viewport ∩ page rects → `pageIndex` list (+ buffer).
4. **Page pool**: reusable slots; LRU / cancel; `renderScaleForWorld(worldScale)`.
5. **Zoom**: same bitmap; CSS / camera transform only (no re-raster on zoom tick).
6. **Text layer**: visible pages when needed for selection.

### Scene layer model (conceptual)

```
Excalidraw stage
├── Camera (Excalidraw scroll + zoom)
│   ├── PdfLayer (DOM under canvas) — PageSlot pool
│   └── Elements — highlights, notes, search images, freehand, arrows
└── HUD (DOM/React, screen space): navigator, find bar, tool chips, sidebars
```

### Performance levers (stay on Excalidraw)

These improve scale **without** replacing the whiteboard:

| Lever | Intent |
|-------|--------|
| Shrink / hard-cap visible set | Memory independent of zoom-out buffer |
| Adaptive / LOD render density | Sharp reading zoom; cheaper overview |
| Evict release | Zero canvas buffers / `page.cleanup()` on pool evict |
| Streaming / range / OPFS (later) | Do not keep entire PDF ArrayBuffer forever |
| Optional page-space annotations | Stable anchors if layout constants change; better list order |

### Performance targets

| Metric | Target |
|--------|--------|
| Pan/zoom | Smooth with warm pool |
| Visible page change | texture ready < 100–200 ms (cache hit ≪) |
| Bitmap memory | configurable hard cap + LRU |
| Open metadata 3000 pages | usable skeleton in a few seconds |

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| GPU / RAM from page bitmaps | Density clamp + visible cap + LRU |
| Fast scroll = render thrashing | cancel jobs; buffer; avoid React on every tick |
| Whole PDF in RAM | later: range / OPFS |
| Linear annotation hit-test | acceptable while element counts stay modest; index later if needed |

### “Done” criteria for scale (host work)

- Open a 3000-page PDF and navigate end to end without freeze.
- Only a bounded number of pages rasterized at once.
- Usable zoom-out overview; sharp enough zoom-in for reading.
- Reload app → annotations restored with the session.

---

## Guiding principle

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations**.

Excalidraw is the canvas stack. Improve the pdf.js host and session model; do not invent a second engine unless Excalidraw itself becomes the bottleneck and product decides otherwise.
