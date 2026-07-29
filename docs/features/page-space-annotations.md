# Page-space annotations

Optional canonical annotation model: geometry in **page coordinates** + `pageIndex`, with Excalidraw as the paint/camera layer.

**Status:** planned — roadmap v1.1 (optional stability upgrade). Scene-space persistence is intentional today (PDF column layout is stable). **Not** a prerequisite for leaving Excalidraw — we are staying on Excalidraw.

---

## Product goals

1. Persist highlights/notes (and later arrows) as `{ pageIndex, …geometry in page space }` so they survive layout-constant changes (gap, world scale).
2. Keep painting on Excalidraw by projecting page-space → scene coords via `PageLayout`.
3. Make list/search/jump features orderable by document position (reliable “page N”).

Out of scope (for now):

- Replacing Excalidraw / building a custom renderer.
- Rewriting freehand into page-space on day one (start with highlights + notes).
- Changing PDF bytes or page order.
- Blocking other features until this lands.

---

## Model

### Target shape (illustrative)

```ts
type PageSpaceHighlight = {
  id: string
  pageIndex: number // 0-based
  // quad/rects in PDF page space (pdf.js / CSS pixel page coords — pick one and document)
  rects: { x: number; y: number; w: number; h: number }[]
  color?: string
  text?: string
}

type PageSpaceNote = {
  id: string
  pageIndex: number
  x: number
  y: number
  width: number
  height: number
  plateValue: unknown
  sourceHighlightId?: string
}
```

Session may still store Excalidraw `elements` for paint/compat, **or** store canonical objects and derive elements on open. Prefer one write path; migrate with a `version` bump on `SessionSnapshot`.

### Projection

```
page space + pageIndex
  → PageLayout page origin / size
  → scene coords for Excalidraw
  → screen via camera zoom/scroll
```

Inverse for create-from-selection: DOM/client → scene → page space.

---

## UX

User-facing behavior should stay the same (select text → highlight, place note, Add note). Benefits show up as:

- Stable marks if column gap / layout constants change.
- Reliable “page N” in [`annotation-panel.md`](annotation-panel.md).

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **Persistence** | Versioned session; migration from pure scene-space snapshots. |
| **Selection → highlights** | Write page-space at create time. |
| **WYSIWYG notes** | Store page anchor; project embeddable rect for paint. |
| **Legacy migration** | Map old lector highlights into page-space when available; else best-effort scene placement. |
| **Search hit overlay** | Same page-space rect language (already used for hits). |

---

## Pitfalls

1. Do not keep two editable sources of truth (scene vs canonical) without a single writer.
2. Locked Excalidraw highlights remain non-bindable — arrow rules in `pdfNotes` still apply at the paint layer.
3. Y stacking / gaps live in `PageLayout` — page-space must not bake in scene Y.

---

## Closed decisions (draft)

1. `pageIndex` 0-based everywhere in app code.
2. Highlights + notes first; freehand later.
3. Excalidraw remains paint/camera; this model is optional host data, not a renderer migration path.
