# Infinite PDF Canvas — Architecture

Canvas infinito with a central PDF (page under page) rendered with PDF.js, plus free annotations: notes, highlights, arrows, and drawings.

Performance goal: PDFs with **3000+ pages** without degrading pan/zoom or render.

## Product vision

- The PDF is the axis of the canvas: pages stacked in a column across infinite space.
- Continuous reading with free pan/zoom (whiteboard style, not classic PDF scroll).
- Annotation layer on top: notes, highlights, arrows, freehand.
- Stable coordinates in document/page space — not screen pixels — so zoom, pan, and persistence do not break annotations.

---

## Optimal plan (target architecture)

Architecture to converge toward for real scale (thousands of pages + many annotations). v1 can live on Excalidraw; this plan is the performance and control destination.

### Target stack

| Layer | Technology | Role |
|-------|------------|------|
| App / shell | Electron + Vite + React + TypeScript | Toolbar, library, side panels, settings |
| PDF | `pdfjs-dist` in **Web Worker** | Parse, `getPage`, render to canvas/`OffscreenCanvas` |
| Visual engine | **PixiJS v8** (preferred) or Canvas2D + own matrix | Layers, page sprites, stroke batching |
| Camera | Own implementation (`x`, `y`, `zoom`) | Pan/zoom at 60fps, independent of React |
| Hit-testing | Own spatial index + engine picker | Select annotations without scanning the whole doc |
| Ink | `perfect-freehand` (+ point simplification) | Smooth freehand; persist as path |
| UI state | Zustand | Active tool, selection, UI flags |
| Document | Typed store | Page metadata, annotations, undo stack |
| Persistence | Disk (appData) + optional IDB for thumbs | Docs, annotations, thumbnail cache |
| Later | HTTP range streaming, tiles, OPFS | Huge remote PDFs / local cache |

**Why Pixi (or own canvas) and not a generic whiteboard at scale:** full control of culling, LOD, and memory budget. Excalidraw/tldraw shine for tools and UX, but a shape store with thousands of pages/elements does not scale like a scene engine with sprite pools and textures.

### React vs frame loop

```
React (infrequent)           Frame loop (each frame / rAF)
─────────────────────        ─────────────────────────────
toolbar, modals              read camera
file picker                  compute visible pages
tool change → store          assign page pool slots
selection UI                 blit textures / redraw overlay
                             hit-test only on pointer events
```

Rule: **pan/zoom must not trigger React re-render**. Camera lives in a mutable store or refs; React only subscribes to what the UI needs (tool, selection count, page indicator).

### Coordinate system

Three spaces; convert explicitly:

| Space | Description |
|-------|-------------|
| **Screen** | Viewport pixels (`clientX/Y`) |
| **World** | Infinite canvas plane (`camera`: world → screen) |
| **Page** | Local to a page: top-left origin, PDF units or normalized 0–1 |

PDF layout in world space (column):

```
pageGap = 24  // world units
page[i].y = sum(page[0..i-1].height) + i * pageGap
page[i].x = 0
page[i].width / height = PDF viewport (base scale 1)
```

Every annotation is stored as:

```ts
{
  id: string
  pageIndex: number
  // geometry in page coords (not world, not screen)
}
```

### Scene layer model

```
Stage / root
├── Camera container (translate + scale)
│   ├── PdfLayer
│   │   └── PageSlot[0..N]     // fixed pool, not 3000 nodes
│   ├── AnnotationLayer
│   │   ├── Highlights
│   │   ├── Strokes
│   │   ├── Arrows / shapes
│   │   └── Notes (anchors)    // pin on page; card can be DOM HUD
│   └── SelectionOverlay
└── HUD (DOM/React, screen space): toolbar, page #, note editors
```

### PDF pipeline (pdf.js)

1. **Open**: `getDocument` in worker.
2. **Metadata pass**: sizes for each page → skeleton layout without rasterizing.
3. **Visible set**: viewport∩page rects → `pageIndex` list (+ buffer).
4. **Page pool**: N reusable slots; LRU eviction.
5. **Render job**: LOD scale → `page.render` → texture; cancel if scrolled away.
6. **Text layer**: only for visible pages when needed for selection.

### Virtualization algorithm

```
onCameraChange (throttled to rAF):
  viewWorld = invert(camera) applied to screen rect
  expand viewWorld by buffer

  visible = pages whose worldAABB intersects expanded view
  // binary search on Y — O(log n + k)

  for page in visible:
    ensureSlot(page)
    ensureTexture(page, lodFor(zoom))

  for slot in pool not in visible:
    mark cold → candidate eviction
```

Suggested budget:

| Zoom | Pages in pool | Resolution |
|------|---------------|------------|
| Far (overview) | many, low-res | thumbnail ~0.2–0.5x |
| Reading | ~8–15 | 1x–1.5x devicePixelRatio |
| Close | ~4–8 | 2x or tiles |

### Annotation layer

Types: `highlight`, `stroke`, `arrow`, `note`, optional `rect`/`ellipse` — all page-space geometry.

Index: `annotationsByPage` + spatial index in world-space; cull to viewport; hit-test via index then fine test.

### Performance targets

| Metric | Target |
|--------|--------|
| Pan/zoom | 60 fps with warm pool |
| Visible page change | texture ready < 100–200 ms (cache hit <<) |
| Bitmap memory | configurable hard cap + LRU |
| Open metadata 3000 pages | usable skeleton in a few seconds |
| Cold overview | progressive thumbnails in idle |

### Risks and mitigations

| Risk | Mitigation |
|------|------------|
| GPU textures too large | LOD + tiles; cap scale |
| Fast scroll = render thrashing | debounce hi-res; show low-res immediately; cancel jobs |
| Main thread blocked by React | camera and render outside reconcile |
| Cross-page annotations | primary `pageIndex` + world points, or rare world-space annotations |
| Huge remote PDF | range requests; do not load all into RAM |

### “Done” criteria for the optimal plan

- Open a 3000-page PDF and navigate end to end without freeze.
- Only a bounded number of pages rasterized at once.
- Thousands of strokes/highlights with viewport culling.
- Usable zoom-out overview (thumbnails), sharp zoom-in (hi-res/tiles).
- Reload app → annotations restored anchored to the same pages.

---

## v1 — Excalidraw (current)

For the first shippable version we prioritize speed and ready annotation UX:

| Layer | Technology |
|-------|------------|
| App | Electron + React + TypeScript |
| PDF | `pdfjs-dist` (worker) |
| Canvas + tools | **Excalidraw** |
| Library | Existing categories store + appData files |
| Persistence | `{pdfId}.session.json` on disk |

### Integration approach

- Excalidraw as annotation and interaction surface.
- PDF as a **virtualized background** under Excalidraw (not 3000 native shapes).
- Only visible pages (+ buffer) render.
- Annotations live in the Excalidraw layer; move toward page-space as soon as practical.

### Conscious v1 limits

- Excalidraw is not the optimal engine for thousands of pages as native shapes.
- If the element store or render starts to hurt, migrate camera/PDF/annotation layer to the optimal plan and reimplement (or adapt) tools on top.

### Bridge v1 → optimal

Prefer storing annotations in the canonical model (`pageIndex` + page-space geometry) even while Excalidraw uses another format internally. Migration then becomes a renderer/tools change, not a document rewrite.

---

## Guiding principle

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations in page coordinates**.

Excalidraw accelerates v1; the optimal plan is the destination when PDF size and annotation volume demand it.
