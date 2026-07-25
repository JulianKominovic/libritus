# WYSIWYG canvas notes

Rich-text sticky notes on the infinite PDF canvas: Excalidraw **embeddable** + Plate via `renderEmbeddable`.

**Status:** implemented — `pdfNotes` / `pdfNoteModel`, `NoteEmbed`, wired in `PdfCanvasApp`.

---

## Product goals

1. Place a note freely (**Place note**) or from a highlight (**Add note** chip → note + host-managed arrow).
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

| Action                     | Behavior                                                                                             |
| -------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Place note**             | Click canvas → create note centered on click; selected, not editing.                                 |
| **Add note** (highlight)   | Creates note + locked host-managed arrow (no Excalidraw bindings). 1st/3rd/… right of highlight; 2nd/4th/… left. |
| **Remove** (highlight)     | Soft-deletes the highlight group + notes with matching `sourceHighlightId` + their `pdfNoteArrow`s. Place-note notes (no link) stay. |
| **Edge / border drag**     | Excalidraw selection and move on the embeddable.                                                     |
| **Click center**           | Activate embed → Plate editable (`activeEmbeddable`).                                                |
| **Escape / click outside** | Leave edit mode (`activeEmbeddable` cleared). Toolbar clicks must **not** exit edit.                 |
| **Type / format**          | `NoteEditorKit` while editing; writes `customData.plateValue`.                                       |
| **Toolbar**                | Fixed sticky bar inside the note + floating bar on selection (no AI). Slash `/` and emoji supported. |

Chrome: **Place note** chip next to **Select text** (bottom-right). Highlight chips **Add note** / **Remove** float above the active highlight (**Remove** cascades linked notes/arrows via `idsDeletedWithHighlight`).

Default note size: **320×240** (`NOTE_WIDTH` / `NOTE_HEIGHT`).

---

## Model

### Excalidraw embeddable

| Field                   | Value                                                                                                                                                                                                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `type`                  | `embeddable`                                                                                                                                                                                                                                                                   |
| `link`                  | `libritus://pdf-note` (whitelist via `validateEmbeddable`; required once so Excalidraw accepts the embed)                                                                                                                                                                      |
| `customData.pdfNote`    | `true`                                                                                                                                                                                                                                                                         |
| `customData.plateValue` | Plate `Value` (JSON)                                                                                                                                                                                                                                                           |
| `customData.sourceHighlightId` | Optional. Set by **Add note** to the highlight `groupId`; used to alternate placement side and for **Remove** cascade (`idsDeletedWithHighlight`). |
| `backgroundColor`       | resolved `--color-morphing-50` via `resolveNoteFill()` (**solid** — required for hit-test; matches NoteEmbed `bg-morphing-50`; painted on Excalidraw canvas, not in the DOM). `NOTE_FILL` is the CSS token `var(--color-morphing-50, #ebebeb)` — do not pass it to Excalidraw. |
| `strokeColor`           | `transparent` (`strokeWidth: 0` — visible chrome is `NoteEmbed`, not Excalidraw)                                                                                                                                                                                               |

**Critical:** `backgroundColor: 'transparent'` makes Excalidraw hit-test **only the stroke**. Always use a solid fill (`NOTE_FILL`). On session open, `normalizePdfNote` forces `NOTE_FILL` / transparent stroke and migrates legacy `rectangle` notes → `embeddable`.

**Link chrome:** Excalidraw draws a canvas link icon and shows `.excalidraw-hyperlinkContainer` when `link` is set. After the embed validates once, `clearPdfNoteLinkForUi` strips `link` in memory (no icon / no open-in-new-tab). Persist / dirty signature always run through `normalizePdfNote` so the session file keeps `libritus://pdf-note`. CSS hides the hyperlink toolbar; `onLinkOpen` always `preventDefault`.

Identity helper: `isPdfNote(el)` → `customData.pdfNote === true`.

### Plate (`NoteEmbed` via `renderEmbeddable`)

- Rendered inside Excalidraw’s embeddable container: scene-sized + CSS `scale(zoom)` — text scales with zoom.
- **Inactive:** static Plate (`BaseEditorKit` static).
- **Active:** editable Plate (`NoteEditorKit`) when `appState.activeEmbeddable` matches the note — fixed + floating toolbars, slash/emoji; **no** AI/Copilot.
- No parallel absolute HUD / `applyGeometry` / React geometry state.

---

## Files

| Path                                               | Role                                                                                     |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `lib/pdf-canvas/pdfNoteModel.ts`                   | `isPdfNote`, `getNotePlateValue`, `queryVisibleNotes`, `findPdfNoteAt`                   |
| `lib/pdf-canvas/pdfNotes.ts`                       | `createWysiwygNote`, `createNoteFromHighlight`, `normalizePdfNote`, `withNotePlateValue` |
| `lib/pdf-canvas/pdfNotes.test.ts`                  | Unit tests for note create / normalize / highlight→arrow invariants                      |
| `organisms/pdf-canvas/NoteEmbed.tsx`               | Plate static/edit inside embeddable                                                      |
| `organisms/pdf-canvas/PdfCanvasApp.tsx`            | Place mode, `renderEmbeddable`, persistence                                              |
| `components/editor/note-editor-kit.tsx`            | Editable kit: schema + note toolbars/slash/emoji (no AI)                                 |
| `components/editor/plugins/note-*-toolbar-kit.tsx` | Fixed / floating toolbar plugins for notes                                               |

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
- Arrow: **no** Excalidraw bindings; `customData.pdfNoteArrow` + `noteId` / `startX` / `startY`; **`locked: true`**; host `syncPdfNoteArrows`.
- Do not use one-sided `endBinding` / elbow (explodes on note drag).
- Per highlight, notes alternate sides via `sourceHighlightId` count: 1st/3rd/… right, 2nd/4th/… left.

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
6. Do not mount full `EditorKit` / AI inside the embed (use `NoteEditorKit` with note toolbars — no AI).
7. **`activeEmbeddable.element` is reference-equal** in Excalidraw. After any `updateScene` that replaces the note, re-set `activeEmbeddable` to the new element (and/or CSS `:has([data-editing])` pointer-events). Otherwise toolbar clicks hit the canvas and exit edit.
8. **Paste / Cmd+D of a stripped note** (`link: null`) fails Excalidraw embed validation permanently (cached by id) if left alone. Fix the link in **`onDuplicate`** via `fixDuplicatedPdfNotes` (same id, same undoable transaction). Do **not** rematerialize under a fresh id with `updateScene(NEVER)` for paste — that orphans the note outside the undo stack. `repairUnvalidatedPdfNotes` remains a safety net for paths that skip `onDuplicate`.
