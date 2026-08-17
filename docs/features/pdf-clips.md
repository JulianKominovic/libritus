# PDF clips — cite other PDFs (draft)

Compact canvas cards for a **secondary PDF**: a web article saved from the browser, or (later) a page/fragment cited from another library document.

**Status:** planned — preview-only cards ship with web-search capture (`Guardar como PDF`). Live annotation, page-nav, and library cites are **not** built.

Aligns with [`product-north.md`](product-north.md) (research on the canvas) and roadmap **Later → cross-PDF links**.

---

## Why this is not a second PDF column

The open document is the **axis** of the canvas: a virtualized `PdfLayer` stacked in world Y, one `PdfDocument` / `PagePool` / session `{pdfId}.session.json`. Putting another PDF in that column (or opening it as the session root) steals reading focus and RAM.

A clip is an **Excalidraw card** beside the axis — same family as search-capture screenshots — not a second `PdfLayer`.

---

## Same type, two sources

Do **not** invent a web-PDF type and a cite-fragment type. One card:

```
source: 'attachment' | 'library'
fileId?: string          // attachments/{id}.pdf (browser save)
pdfId?: string           // library {pdfId}.pdf
pageIndex?: number       // 0-based; omit = whole doc / first page face
rects?: { x, y, w, h }[] // optional fragment in page space
text?: string            // quoted snippet
previewFileId: string    // PNG that paints (Excalidraw image fileId)
```

Today only `source: 'attachment'` is written (`customData.pdfClip`). Library cites are the same shape plus `pdfId` / `pageIndex` / `rects`.

### Relation to other features

| Feature | Relation |
| --- | --- |
| [`page-space-annotations.md`](page-space-annotations.md) | Geometry of the **open** PDF. Does not give `sourcePdfId`. Clips need document identity on top of page-space. |
| Highlights today | Scene coords; `pageIndex` is derived from layout Y, not stored. Not enough for a stable cite. |
| Note @mentions | Navigate to another **route** (close this session). Not a canvas cite. |
| RAG `[p.N]` chips | Jump on the **open** PDF. |
| Web search capture | Screenshot of a page. Save as PDF is the clip path; Capturar stays a search-capture image. |

---

## Shipped in this slice (preview only)

- Bytes: `attachments/{fileId}.pdf` (not `categories.json`, not a new library row).
- Face: first-page raster, or a screenshot of the HTML view when `printToPDF` was used.
- Size: fit in ~280×400 world units so it does not compete with Letter-width pages.
- Click: no-op beyond normal Excalidraw select/move. Does **not** replace the central PDF.

---

## Annotation (not decided — next cut)

Two options; both keep the central PDF as the axis:

1. **Expand to read** — double-click opens a temporary reader (overlay or the existing browser window loading the file) for that clip only. Highlights/notes stored against `{ source, fileId|pdfId, pageIndex, rects }`. Close returns to the canvas.
2. **Mini viewer in the card** — small pool + selection inside the embed. Shares hit-test / pass-through / RAM cost with a second live PDF. Largest cut.

A second full `PdfLayer` column is out: it is the central-PDF product, not a citation.

---

## Acceptance (when annotation ships)

- Open PDF A → clip a page (or web-saved PDF) → card stays small; A remains the axis.
- Reload session: clip + preview still there; `{fileId}.pdf` / library `{pdfId}.pdf` still readable.
- Highlight/note on the clip does not write into A's page column as if it were A's text.
- Deleting the card does not delete library PDFs (attachments may orphan — same as search PNG GC).

---

## Files (preview path today)

[`pdfClip.ts`](../../src/renderer/src/lib/pdf-canvas/pdfClip.ts), [`useSearchCaptureBrowser.ts`](../../src/renderer/src/organisms/pdf-canvas/useSearchCaptureBrowser.ts) (`browser:pdf-saved`), [`src/main/web-browser.ts`](../../src/main/web-browser.ts) (`printToPDF` / fetch / `will-download`).
