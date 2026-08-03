# Annotation polish

Day-to-day quality-of-life for highlights and notes: colors, delete note, copy text, small interaction fixes.

**Status:** done — highlight colors, remove note, and copy highlight text shipped.

---

## Product goals

1. Let the user style highlights (at least a small color set) without unlocking Excalidraw’s generic fill UI in a confusing way.
2. Delete a note (and its highlight→note arrow when appropriate) from chrome or keyboard.
3. Copy highlight text to the clipboard from the active highlight toolbar.
4. Keep highlight/note identity rules intact (`pdfHighlight` / `pdfNote`, locked highlights).

Out of scope (for now):

- Full style system for every Excalidraw shape.
- OCR for scanned PDFs.
- Collaborative cursors / comments threads.
- Cmd/Ctrl+C of a pending selection without using the toolbar (toolbar **Copiar** covers pending + committed paths).

---

## Text selection (EmbedPDF)

Text select uses EmbedPDF `SelectionPlugin` (glyph hit-test + `SelectionLayer`) under Excalidraw pass-through (`.pdf-text-pass`). Highlights come from `getFormattedSelection()` → scene skeletons — not DOM `window.getSelection()`.

Viewport/Scroller/RenderLayer stay unmounted (Excalidraw owns the camera).

---

## UX

### Done

| Action | Behavior |
|--------|----------|
| **Highlight color** | Palette on the active highlight toolbar (next to Add note / Buscar / Copiar / Remove). Persist color on the highlight group (`HIGHLIGHT_COLORS` / `setHighlightGroupColor`). |
| **Remove note** | Select the note (grab the **edge**), then Backspace/Delete. Excalidraw deletes the note embeddable; host cleans up its `pdfNoteArrow`. Source highlight is **kept**. Undo restores note + arrow. No dedicated “Remove note” chip. |
| **Remove highlight** | Done in v1: cascades notes with `sourceHighlightId` + their arrows (`idsDeletedWithHighlight`). |
| **Copy text** | **Copiar** on the highlight toolbar (pending text selection or committed highlight) writes `customData.text` to the clipboard and closes the toolbar. No session dirty. |

Default highlight appearance stays readable on light pages (light-mode only).

---

## Model / approach

- Colors: store on highlight element (`backgroundColor` / `customData`) consistently with how `selectionToHighlights` creates rects — shipped via `HighlightToolbar` + `setHighlightGroupColor`.
- Note delete: Excalidraw keyboard delete when the note is selected; host ensures `pdfNoteArrow` is removed with the note (highlight preserved).
- Copy: read `customData.text` from the active highlight → `navigator.clipboard.writeText`; hide toolbar after.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **WYSIWYG notes** | Remove-note must respect host-managed arrow / `pdfNoteArrow` rules (do not leave orphan connectors). |
| **Annotation panel** | List updates when color/delete changes. |
| **Sessions** | Color + deletes dirty the session like any scene edit. Copy does not. |

---

## Closed decisions

1. **Final / shipped.** Small fixed palette beats full color picker for v1.
2. **Final / shipped.** Remove note ≠ Remove highlight. UX = keyboard delete on selected note (not a chip); highlight stays.
3. **Final / shipped.** Copy = **Copiar** on the highlight toolbar (`customData.text`), not a separate text-select chip / Cmd+C path.

---

## Acceptance

### Shipped

- [x] Active highlight shows a small color palette next to Add note / Buscar / Copiar / Remove; choosing a color updates the highlight group and persists in the session.
- [x] Select a note (edge) → Backspace/Delete removes the note and its `pdfNoteArrow`; source highlight remains; undo restores note + arrow.
- [x] Pending or active highlight → **Copiar** copies `customData.text` to the clipboard and closes the toolbar.
