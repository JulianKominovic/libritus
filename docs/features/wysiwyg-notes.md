# WYSIWYG canvas notes

Rich-text sticky notes on the infinite PDF canvas: Excalidraw **embeddable** + Plate via `renderEmbeddable`.

**Status:** implemented — `pdfNotes` / `pdfNoteModel`, `NoteEmbed`, wired in `PdfCanvasApp`.

---

## Product goals

1. Place a note freely (**Place note**) or from a highlight (**Add note** chip → note + elbow arrow).
2. Notes show formatted content (Plate / same schema as essays) while reading.
3. **Drag / select / resize** like any Excalidraw shape (grab the **border / edge**, not the center).
4. **Edit** by **clicking the center** (Excalidraw embed activate); Escape leaves edit mode.
5. Persist `plateValue` inside the session (`{pdfId}.session.json`) with the rest of the scene.

Out of scope (for now):

- Page-space `pageIndex` anchoring (notes still live in Excalidraw **scene** coords).
- Migrating legacy margin comments from `categories.json`.
- Dedicated note tool in Excalidraw’s native toolbar (we use app chrome + `customData`).

---

## UX

| Action | Behavior |
|--------|----------|
| **Place note** | Click canvas → create note centered on click; selected, not editing. |
| **Add note** (highlight) | Creates note to the right + elbow arrow (start unbound, end bound to note). |
| **Edge / border drag** | Excalidraw selection and move on the embeddable. |
| **Click center** | Activate embed → Plate editable (`activeEmbeddable`). |
| **Escape** | Leave edit mode (`activeEmbeddable` cleared). |
| **Type / format** | `NoteEditorKit` while editing; writes `customData.plateValue`. |

Chrome: **Place note** chip next to **Select text** (bottom-right). Highlight chip **Add note** floats above the active highlight.

---

## Model

### Excalidraw embeddable

| Field | Value |
|-------|--------|
| `type` | `embeddable` |
| `link` | `libritus://pdf-note` (whitelist via `validateEmbeddable`; required once so Excalidraw accepts the embed) |
| `customData.pdfNote` | `true` |
| `customData.plateValue` | Plate `Value` (JSON) |
| `backgroundColor` | `#fff3bf` (**solid** — required for hit-test) |
| `strokeColor` | `#fab005` |

**Critical:** `backgroundColor: 'transparent'` makes Excalidraw hit-test **only the stroke**. Always use a solid fill (`NOTE_FILL`). On session open, `normalizePdfNote` patches transparent fill and migrates legacy `rectangle` notes → `embeddable`.

**Link chrome:** Excalidraw draws a canvas link icon and shows `.excalidraw-hyperlinkContainer` when `link` is set. After the embed validates once, `clearPdfNoteLinkForUi` strips `link` in memory (no icon / no open-in-new-tab). Persist / dirty signature always run through `normalizePdfNote` so the session file keeps `libritus://pdf-note`. CSS hides the hyperlink toolbar; `onLinkOpen` always `preventDefault`.

Identity helper: `isPdfNote(el)` → `customData.pdfNote === true`.

### Plate (`NoteEmbed` via `renderEmbeddable`)

- Rendered inside Excalidraw’s embeddable container: scene-sized + CSS `scale(zoom)` — text scales with zoom.
- **Inactive:** static Plate (`NoteEditorKit` / `BaseEditorKit` static).
- **Active:** editable Plate when `appState.activeEmbeddable` matches the note.
- No parallel absolute HUD / `applyGeometry` / React geometry state.

---

## Files

| Path | Role |
|------|------|
| `lib/pdf-canvas/pdfNoteModel.ts` | `isPdfNote`, `getNotePlateValue`, `queryVisibleNotes`, `findPdfNoteAt` |
| `lib/pdf-canvas/pdfNotes.ts` | `createWysiwygNote`, `createNoteFromHighlight`, `normalizePdfNote`, `withNotePlateValue` |
| `lib/pdf-canvas/pdfNotes.test.ts` | Unit tests for note create / normalize / highlight→arrow invariants |
| `organisms/pdf-canvas/NoteEmbed.tsx` | Plate static/edit inside embeddable |
| `organisms/pdf-canvas/PdfCanvasApp.tsx` | Place mode, `renderEmbeddable`, persistence |

---

## Flow

```
Place / Add note
  → createWysiwygNote (embeddable + solid fill + plateValue)
  → updateScene (select; do not auto-activate)

Pan / zoom / drag
  → Excalidraw owns transform (translate + scale(zoom))

Click center of note
  → Excalidraw activeEmbeddable = active
  → NoteEmbed mounts editable Plate
  → Plate onChange → withNotePlateValue → updateScene

Escape / click outside
  → clear activeEmbeddable → static Plate
```

### Arrow from highlight (same traps as before)

- Highlight stays `locked`.
- Arrow: **no** `startBinding`; `endBinding` on note; `elbowed: true`.
- Do not bind the start to the locked highlight.

---

## Persistence

`plateValue` rides inside the element’s `customData` in the session snapshot. No separate notes file. Autosave / flush behavior is unchanged (`docs/features/persistence-and-sessions.md`).

---

## Pitfalls (do not regress)

1. **No geometry in React state** tied to Excalidraw `onChange` → `Maximum update depth exceeded`.
2. **No auto-activate on create** → editing would block drag.
3. **Solid fill** on the embeddable → interior hit-test / edge drag.
4. **`validateEmbeddable`** must allow `libritus://pdf-note` or the embed never mounts.
5. **Center click = edit**; drag from the **edge** (Excalidraw embed UX).
6. Do not mount full `EditorKit` / AI inside the embed (use `NoteEditorKit`).
