# Page-space annotations

Canonical annotation model: geometry in **page coordinates** + `pageIndex`, with Excalidraw (or a future renderer) as a paint layer only.

**Status:** planned — roadmap v1.1; required before a renderer migration stays safe.

---

## Product goals

1. Persist highlights/notes (and later arrows) as `{ pageIndex, …geometry in page space }` so they survive layout/camera/renderer changes.
2. Keep painting on Excalidraw in v1.1 by projecting page-space → scene coords via `PageLayout`.
3. Stop deepening the scene-only dead end for new annotation features.
4. Make list/search/jump features orderable by document position.

Out of scope (for now):

- Replacing Excalidraw with Pixi (v2).
- Rewriting freehand into page-space on day one (start with highlights + notes).
- Changing PDF bytes or page order.

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
- Safer path to a non-Excalidraw renderer later.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **Persistence** | Versioned session; migration from pure scene-space snapshots. |
| **Selection → highlights** | Write page-space at create time. |
| **WYSIWYG notes** | Store page anchor; project embeddable rect for paint. |
| **Legacy migration** | Map old lector highlights into page-space, not scene guesses when possible. |
| **Search hit overlay** | Same page-space rect language. |

---

## Pitfalls

1. Do not keep two editable sources of truth (scene vs canonical) without a single writer.
2. Locked Excalidraw highlights remain non-bindable — arrow rules in `pdfNotes` still apply at the paint layer.
3. Y stacking / gaps live in `PageLayout` — page-space must not bake in scene Y.

---

## Closed decisions (draft)

1. `pageIndex` 0-based everywhere in app code.
2. Highlights + notes first; freehand later.
3. Excalidraw remains paint/camera in v1.1.
