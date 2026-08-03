# Adaptive PDF page render scale — agent handoff

**Status:** Phase 1 done; Phase 2 optional / not started.  
**Related:** world-scale normalization ([`pageWorldScale.ts`](../../src/renderer/src/lib/pdf-canvas/pageWorldScale.ts)), roadmap LOD ([`docs/roadmap.md`](../roadmap.md)), memory notes in [`AGENTS.md`](../../AGENTS.md).

This doc is a handoff for implementing sharper / more consistent page bitmaps across PDFs. It is **not** the full zoom-based LOD system (see roadmap **Scale / memory**); it is the smaller fix that becomes necessary once pages are normalized to a shared world width. Excalidraw stays the canvas — LOD is host/EmbedPDF work.

---

## Symptom

Depending on which PDF you open, pages look sharper or softer at the same Excalidraw zoom (e.g. 100% / 200%). Notes and UI chrome stay crisp; only the PDF bitmap softens.

`FIXED_RENDER_SCALE = 2` in [`PdfRenderer.ts`](../../src/renderer/src/lib/pdf-canvas/PdfRenderer.ts) was the hardcoded native scale. After **world-scale normalization**, that constant no longer means “2 CSS pixels per world unit” for every document — Phase 1 derives render scale from `worldScale`.

---

## Two different problems (do not conflate)

### A. Density mismatch after `pageWorldScale` (fixed in Phase 1)

Pipeline:

1. The engine reports **native** page size (PDF points at scale 1).
2. `pageWorldScale` sets `worldScale = 612 / maxNativeWidth` and builds `PageLayout` in **world** units (~Letter width).
3. `PagePool` rasters with `renderScaleForWorld(worldScale)` in **native** PDF units.
4. `PdfLayer` CSS-sizes the canvas to **world** page width/height.

Effective on-screen density:

```
bitmapPx / cssPx ≈ renderScale / worldScale ≈ TARGET_WORLD_DENSITY (clamped)
```

| Native page width  | `worldScale` | Adaptive bitmap | CSS width | Density |
| ------------------ | ------------ | --------------- | --------- | ------- |
| 612 (Letter)       | 1            | 1224            | 612       | **2×**  |
| 300 (small crop)   | 2.04         | ~1224 (max 4)   | 612       | **~2×** |
| 2000 (scan-as-pts) | 0.306        | ~612 (min 1)    | 612       | **~1×** |

```ts
renderScale = clamp(TARGET_WORLD_DENSITY * worldScale, 1, 4)
// TARGET_WORLD_DENSITY = 2
```

`PdfCanvasApp` passes `{ renderScale: renderScaleForWorld(worldScale) }` into `PagePool`.

### B. Truly low-quality page content (limited; do not overpromise)

Some PDFs are soft because the **source** is soft: a full-page scan embedded as a JPEG/PNG at low DPI. Raising `renderScale` only upsamples that image — no new detail.

“Detect low quality and bump scale” only helps when:

- Softness comes from **under-rasterizing vectors/text** (problem A), or
- You want a **higher zoom LOD** later (roadmap), not a one-shot open-time bump.

Detection can still be useful for **telemetry / heuristics / UI** (“this looks like a scan”) or to **avoid** wasting RAM on huge scales when the page is already image-bound.

#### Feasible signals (engine / page content)

On a sample of pages (e.g. first page + a middle page), after `getPage`:

1. **Image coverage / DPI (best cheap signal)**  
   Walk page operators / XObjects (or EmbedPDF equivalents for embedded images). For large images:
   - `effectiveDpi ≈ (imagePixelWidth / pageWidthPts) * 72`
   - If one image covers most of the page and `effectiveDpi < ~120–150`, treat as **scan / low-res image page**.

2. **Text density**  
   Extracted text item count / page area. Near-zero text + full-bleed image → scan. Lots of text → vector/text PDF (Fix A is enough).

3. **Native MediaBox size alone is not quality**  
   Small MediaBox ≠ low quality (often a crop). Large MediaBox ≠ high quality (often a scan with points = pixels). Always combine with (1).

#### What detection should **not** do

- Auto-set `renderScale = 8` on “low quality” scans — burns RAM, barely helps.
- Block open on a full-doc image scan (too slow for 3000 pages). Sample 1–3 pages max.
- Confuse with world-scale: always apply Fix A first; detection is optional polish.

---

## Implementation order

### Phase 1 — density-compensated render scale (done)

1. Keep `REFERENCE_PAGE_WIDTH` / `pageWorldScale` as-is.
2. `renderScaleForWorld(worldScale, targetDensity = 2)` in [`pageWorldScale.ts`](../../src/renderer/src/lib/pdf-canvas/pageWorldScale.ts).
3. `PagePool` accepts `renderScale`; `PdfCanvasApp` passes `renderScaleForWorld(worldScale)`.
4. CSS size in `PdfLayer` stays world page size — unchanged.
5. Unit tests: `1→2`, `2→4`, `0.5→1`, clamp to 4, PagePool injected scale.

**Memory:** for huge native pages, Phase 1 **reduces** bitmap size vs `scale=2` in native space. For tiny pages it **increases** toward Letter budget. Net is more predictable RAM (~constant per visible page).

### Phase 2 — optional quality probe (only if still needed)

1. `probePageQuality(doc, pageIndex) → { kind: 'vector' | 'scan' | 'mixed', approxDpi?: number }` using image DPI heuristic on ≤3 pages at open.
2. Store on `RuntimeSession` (not in session.json unless you need it later).
3. Policy (conservative):
   - `vector` / unknown → Phase 1 scale only.
   - `scan` with low DPI → **do not** raise render scale; optional future: show nothing, or a one-line “scanned PDF” hint.
   - Cap Phase 1 `MAX_SCALE` tighter when `scan` to save RAM.

Skip Phase 2 until Phase 1 is validated in product — most “definition differs by PDF” reports should disappear after A.

### Out of scope (do not sneak in)

- Full zoom-based LOD / tile pyramid (roadmap **Scale / memory**).
- Re-raster on every zoom tick.
- Patching Excalidraw.
- Putting page bitmaps into the Excalidraw element store.
- Raising global `FIXED_RENDER_SCALE` without tying it to `worldScale` (makes huge PDFs worse for RAM).
- Building a custom canvas engine for sharpness.

---

## Files touched (Phase 1)

| File                                                                               | Change                                                      |
| ---------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [`PdfRenderer.ts`](../../src/renderer/src/lib/pdf-canvas/PdfRenderer.ts)           | `FIXED_RENDER_SCALE` = default density / fallback.          |
| [`pageWorldScale.ts`](../../src/renderer/src/lib/pdf-canvas/pageWorldScale.ts)     | `renderScaleForWorld(worldScale)`.                          |
| [`PagePool.ts`](../../src/renderer/src/lib/pdf-canvas/PagePool.ts)                 | Accept `renderScale`; use in `renderSlot`.                  |
| [`PdfCanvasApp.tsx`](../../src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx) | Pass `renderScaleForWorld(worldScale)` into `new PagePool`. |
| Tests                                                                              | `renderScaleForWorld` + PagePool injected scale.            |

Search hits already multiply by `layout.scale`. Text selection uses EmbedPDF `SelectionLayer` at the same page CSS scale (`layout.scale`).

---

## Constraints (from AGENTS.md)

- Pan/zoom must remain CSS/camera only; do not re-render PDF pages on zoom for this fix.
- Visible set + pool caps still apply; sharper small PDFs must not remove culling.
- Letter ≈ 8 MB RGBA at density 2; design Phase 1 so every doc targets that ballpark, not native×2 for 2000pt pages.
- Never patch `node_modules/@excalidraw/*`.

---

## Acceptance checks

- [x] Two PDFs with very different MediaBox widths look similarly sharp at the same zoom after open.
- [x] World layout / notes / highlights / text select still align (worldScale path unchanged).
- [x] Session v1→v2 migration still works (render scale is not persisted; only display).
- [x] Peak bitmap size for a “huge native” PDF is not larger than today (should be smaller).
- [x] Unit tests for `renderScaleForWorld` + PagePool using injected scale.

---

## Quick decision tree for the implementing agent

```
Soft PDF reported?
  ├─ Small MediaBox / worldScale > 1? → Phase 1 (raise renderScale with worldScale). Done.
  ├─ Large MediaBox / already sharp but RAM high? → Phase 1 still (lower native renderScale). Done.
  └─ Full-page scan, soft even after Phase 1?
        → Content-limited. Phase 2 detect only; do not crank scale.
        → Real fix is better source PDF or future hi-res tiles / LOD, not open-time scale bump.
```

---

## Context already shipped (do not redo)

- World width normalization: `pageWorldScale`, `PageLayout.scale`, session `version: 2`, v1 migrate via `scaleSessionScene`.
- Text layer scale = `worldScale`.
- Search hit paint × `layout.scale`.
- **Phase 1:** PagePool render scale derived from `worldScale` via `renderScaleForWorld`.
