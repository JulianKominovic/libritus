# Annotation polish

Day-to-day quality-of-life for highlights and notes: colors, delete note, copy text, small interaction fixes.

**Status:** partial — highlight colors and remove note shipped; copy text without creating a highlight remains planned.

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

### Done

| Action | Behavior |
|--------|----------|
| **Highlight color** | Palette on the active highlight toolbar (next to Add note / Buscar / Remove). Persist color on the highlight group (`HIGHLIGHT_COLORS` / `setHighlightGroupColor`). |
| **Remove note** | Select the note (grab the **edge**), then Backspace/Delete. Excalidraw deletes the note embeddable; host cleans up its `pdfNoteArrow`. Source highlight is **kept**. Undo restores note + arrow. No dedicated “Remove note” chip. |
| **Remove highlight** | Done in v1: cascades notes with `sourceHighlightId` + their arrows (`idsDeletedWithHighlight`). |

### Remaining

| Action | Behavior |
|--------|----------|
| **Copy text** | With a DOM selection in text-select mode: Cmd/Ctrl+C copies plain text **without** creating a highlight. Optional “Copy” chip. |

Default highlight appearance stays readable on light pages (light-mode only).

---

## Model / approach

- Colors: store on highlight element (`backgroundColor` / `customData`) consistently with how `selectionToHighlights` creates rects — shipped via `HighlightToolbar` + `setHighlightGroupColor`.
- Note delete: Excalidraw keyboard delete when the note is selected; host ensures `pdfNoteArrow` is removed with the note (highlight preserved).
- Copy (remaining): `window.getSelection().toString()` — no need to invent a parallel selection model.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **WYSIWYG notes** | Remove-note must respect host-managed arrow / `pdfNoteArrow` rules (do not leave orphan connectors). |
| **Annotation panel** | List updates when color/delete changes. |
| **Sessions** | Color + deletes dirty the session like any scene edit. |

---

## Closed decisions

1. **Final / shipped.** Small fixed palette beats full color picker for v1.
2. **Final / shipped.** Remove note ≠ Remove highlight. UX = keyboard delete on selected note (not a chip); highlight stays.
3. **Planned / open.** Copy text works without creating a highlight.

---

## Acceptance

### Shipped

- [x] Active highlight shows a small color palette next to Add note / Buscar / Remove; choosing a color updates the highlight group and persists in the session.
- [x] Select a note (edge) → Backspace/Delete removes the note and its `pdfNoteArrow`; source highlight remains; undo restores note + arrow.

### Remaining

- [ ] In Select text mode, with a DOM text selection and **no** highlight created: Cmd/Ctrl+C copies the selected plain text to the clipboard.
- [ ] Optional: a “Copy” chip on the text-select chrome that does the same.
