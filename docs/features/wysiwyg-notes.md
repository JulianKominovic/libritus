# WYSIWYG canvas notes

Rich-text sticky notes on the infinite PDF canvas: Excalidraw placeholder + Plate HUD overlay.

**Status:** implemented — `pdfNotes` / `pdfNoteModel`, `NoteLayer`, wired in `PdfCanvasApp`.

---

## Product goals

1. Place a note freely (**Place note**) or from a highlight (**Add note** chip → note + elbow arrow).
2. Notes show formatted content (Plate / same schema as essays) while reading.
3. **Drag / select / resize** like any Excalidraw shape (single click).
4. **Edit** only on **double-click**; Escape leaves edit mode.
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
| **Single click / drag** | Excalidraw selection and move on the placeholder. |
| **Double-click** | Enter edit mode; caret near click; Plate gets focus (after Excalidraw pointerup). |
| **Escape** | Leave edit mode; HUD returns to read-only. |
| **Type / format** | `NoteEditorKit` while editing (schema without AI/collab/toolbars); writes `customData.plateValue`. |

Chrome: **Place note** chip next to **Select text** (bottom-right). Highlight chip **Add note** floats above the active highlight.

---

## Model

### Excalidraw placeholder

| Field | Value |
|-------|--------|
| `type` | `rectangle` |
| `customData.pdfNote` | `true` |
| `customData.plateValue` | Plate `Value` (JSON) |
| `backgroundColor` | `#fff3bf` (**solid** — required) |
| `strokeColor` | `#fab005` |

**Critical:** `backgroundColor: 'transparent'` makes Excalidraw hit-test **only the stroke**. Borders drag; the center does not. Always use a solid fill (`NOTE_FILL`). Legacy transparent notes are patched on session open via `ensureNoteFill`.

Identity helper: `isPdfNote(el)` → `customData.pdfNote === true`.

### HUD (`NoteLayer`)

- DOM cards positioned over the placeholder (scene → viewport).
- **Geometry:** imperative `applyGeometry` (ref) — never React state driven by Excalidraw `onChange` (infinite update loop).
- **React state:** note ids + `plateValue` only when identity/content changes.
- **Inactive:** `pointer-events-none` including descendants (`[&_*]:…`) so hits reach Excalidraw.
- **Active (editing):** card above Excalidraw (`z-[15]`), `pointer-events-auto`, Plate editable.

---

## Files

| Path | Role |
|------|------|
| `lib/pdf-canvas/pdfNoteModel.ts` | `isPdfNote`, `getNotePlateValue`, `queryVisibleNotes`, `findPdfNoteAt` |
| `lib/pdf-canvas/pdfNotes.ts` | `createWysiwygNote`, `createNoteFromHighlight`, `ensureNoteFill`, `withNotePlateValue` |
| `lib/pdf-canvas/pdfNotes.test.ts` | Unit tests for note create / fill / highlight→arrow invariants |
| `organisms/pdf-canvas/NoteLayer.tsx` | Read/edit HUD + caret/focus on enter edit |
| `organisms/pdf-canvas/PdfCanvasApp.tsx` | Place mode, double-click edit, sync, persistence |

---

## Flow

```
Place / Add note
  → createWysiwygNote (solid fill + plateValue)
  → updateScene (select; do not auto-edit)

Pan / drag
  → Excalidraw onChange → syncVisibleNotes
  → applyGeometry (DOM) ; setState only if note set/content changed

Double-click note
  → setActiveNote(id, caret client coords)
  → NoteEditableBody mounts → focus + caret after pointerup
  → Plate onChange → withNotePlateValue → updateScene
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
2. **No auto-edit on create** → edit HUD would eat drag (`pointer-events-auto`).
3. **Solid fill** on the placeholder → interior hit-test.
4. **Focus after double-click** → reclaim after Excalidraw `pointerup` (canvas steals focus on the same gesture).
5. **`pointer-events` is not inherited** → inactive cards need `[&_*]:pointer-events-none`.
