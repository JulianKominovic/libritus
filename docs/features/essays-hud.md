# Essays HUD

Long-form writing surface for research that outgrows sticky notes — part of the canvas investigation, not a PdfSidebar tab.

**Status:** planned — legacy essays UI was removed with the lector; reintroduce as a **canvas research surface** (HUD / canvas-docked), see roadmap v1.1 and [`product-north.md`](product-north.md).

---

## Product goals

1. Write long-form notes (Plate, same family as WYSIWYG canvas notes) without covering the PDF as a sticky.
2. Treat essays as **research on / with the canvas** — canvas HUD or canvas-docked surface — **not** a `PdfSidebar` tab and not a permanent research silo in app chrome.
3. Optionally link an essay (or section) to a page / highlight later; v1 can be “one essay doc per PDF”.
4. Persist separately from — or clearly alongside — session scene elements so large Plate trees do not bloat every camera autosave if avoidable.

Out of scope (for now):

- Multi-user collab / AI Copilot inside the essay (same constraint as canvas notes: no `EditorKit` AI).
- Auto-summaries written by AI into the essay (conflicts with product north; user may paste asked-for text themselves).
- Putting the full essay body into Excalidraw `elements` by default (storage option open; UX is still canvas-adjacent research).
- Rebuilding the entire pre-canvas essays UX pixel-for-pixel.
- Adding essays as a PdfSidebar tab.

---

## UX

| Control | Behavior |
|---------|----------|
| **Open essays** | Toggle from canvas chrome (not Outline/Pages/Chat tabs). |
| **Edit** | Plate editor (`NoteEditorKit`-class kit or shared essay kit — **no AI**). |
| **Resize / collapse** | Width / dock; collapsed = more canvas. |
| **Empty** | Start with empty doc / placeholder title. |

Reading the PDF and editing the essay should work in parallel: focus vs canvas focus must be obvious.

---

## Model / approach

### Storage options (pick one in impl)

| Option | Pros | Cons |
|--------|------|------|
| **A.** Field on session JSON (`essayPlateValue`) | One file | Large writes on every essay keystroke unless debounced separately |
| **B.** Sidecar `{pdfId}.essay.json` | Isolates large docs | Two files to flush on leave |
| **C.** Back into `categories.json` legacy essays | Migration-friendly | Mixes catalog with heavy content |

Prefer **B** (or A with a separate dirty/debounce channel). Default is not “full essay body as Excalidraw embeddable,” but the surface remains canvas research, not sidebar research.

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
| **Product north** | Essays are research memory; keep them with the canvas, not PdfSidebar. |

---

## Closed decisions (draft)

1. Canvas research surface / HUD — **not** a PdfSidebar tab; not “app side panel as the forever home.”
2. No AI kit inside the essay editor; no auto-summarize CTAs.
3. One primary essay document per PDF for v1 (multi-essay tabs later if needed).
