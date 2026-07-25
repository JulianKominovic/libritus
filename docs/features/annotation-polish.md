# Annotation polish

Day-to-day quality-of-life for highlights and notes: colors, delete note, copy text, small interaction fixes.

**Status:** planned.

---

## Product goals

1. Let the user style highlights (at least a small color set) without unlocking Excalidraw’s generic fill UI in a confusing way.
2. Delete a note (and its highlight→note arrow when appropriate) from chrome or keyboard.
3. Copy selected PDF text to the clipboard from text-select mode (even if the user does not create a highlight).
4. Keep highlight/note identity rules intact (`pdfHighlight` / `pdfNote`, locked highlights).

Out of scope (for now):

- Full style system for every Excalidraw shape.
- OCR for scanned PDFs.
- Collaborative cursors / comments threads.

---

## UX

| Action | Behavior |
|--------|----------|
| **Highlight color** | Chip or palette on the active highlight toolbar (next to Add note / Remove). Persist color on the element. |
| **Remove note** | Deletes the note embeddable; if an arrow exists solely for that note (from Add note), delete it too. Do **not** delete the source highlight unless asked. |
| **Copy text** | With a DOM selection in text-select mode: Cmd/Ctrl+C copies plain text. Optional “Copy” chip. |
| **Remove highlight** | Done in v1: cascades notes with `sourceHighlightId` + their arrows (`idsDeletedWithHighlight`). |

Default highlight appearance stays readable on light pages (light-mode only).

---

## Model / approach

- Colors: store on highlight element (`backgroundColor` / `customData`) consistently with how `selectionToHighlights` creates rects.
- Note delete: pure helper on elements array (mirror `createNoteFromHighlight` invariants in reverse).
- Copy: `window.getSelection().toString()` — no need to invent a parallel selection model.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **WYSIWYG notes** | Remove-note must respect host-managed arrow / `pdfNoteArrow` rules (do not leave orphan connectors). |
| **Annotation panel** | List updates when color/delete changes. |
| **Sessions** | Color + deletes dirty the session like any scene edit. |

---

## Closed decisions (draft)

1. Small fixed palette beats full color picker for v1.
2. Remove note ≠ Remove highlight.
3. Copy text works without creating a highlight.
