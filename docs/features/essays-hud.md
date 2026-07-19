# Essays HUD

Long-form writing surface beside the PDF canvas: essays / summaries that outgrow sticky notes.

**Status:** planned — legacy essays UI was removed with the lector; reintroduce as canvas HUD/side panel (see roadmap v1.1).

---

## Product goals

1. Write long-form notes (Plate, same family as WYSIWYG canvas notes) without covering the PDF as a sticky.
2. Keep the essay docked as **app chrome** (side panel / drawer), not an Excalidraw embeddable by default.
3. Optionally link an essay (or section) to a page / highlight later; v1 can be “one essay doc per PDF”.
4. Persist separately from — or clearly alongside — session scene elements so large Plate trees do not bloat every camera autosave if avoidable.

Out of scope (for now):

- Multi-user collab / AI Copilot inside the essay (same constraint as canvas notes: no `EditorKit` AI).
- Putting the full essay body into Excalidraw `elements`.
- Rebuilding the entire pre-canvas essays UX pixel-for-pixel.

---

## UX

| Control | Behavior |
|---------|----------|
| **Open essays** | Toggle panel from canvas chrome. |
| **Edit** | Plate editor (`NoteEditorKit`-class kit or shared essay kit — **no AI**). |
| **Resize / collapse** | Panel width; collapsed = more canvas. |
| **Empty** | Start with empty doc / placeholder title. |

Reading the PDF and editing the essay should work in parallel: panel focus vs canvas focus must be obvious.

---

## Model / approach

### Storage options (pick one in impl)

| Option | Pros | Cons |
|--------|------|------|
| **A.** Field on session JSON (`essayPlateValue`) | One file | Large writes on every essay keystroke unless debounced separately |
| **B.** Sidecar `{pdfId}.essay.json` | Isolates large docs | Two files to flush on leave |
| **C.** Back into `categories.json` legacy essays | Migration-friendly | Mixes catalog with heavy content |

Prefer **B** (or A with a separate dirty/debounce channel). Do not store essays as Excalidraw embeddables.

### Legacy

Map old `categories.json` essays into the new store when opening a PDF ([`legacy-migration-and-export.md`](legacy-migration-and-export.md)).

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **WYSIWYG notes** | Stickies = margin; essays = long-form. Share Plate schema where practical. |
| **Annotation panel** | Do not list the whole essay as a canvas annotation row. |
| **Sessions** | Flush essay on leave with the same reliability bar as session. |
| **Page-space** | Optional deep-links from essay mentions → page/highlight later. |

---

## Closed decisions (draft)

1. HUD/panel, not Excalidraw embeddable.
2. No AI kit inside the essay editor.
3. One primary essay document per PDF for v1 (multi-essay tabs later if needed).
