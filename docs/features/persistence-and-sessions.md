# Persistence and Sessions

Session snapshot for the infinite PDF canvas: Excalidraw annotations + camera, **without** putting the PDF inside the scene JSON.

Libritus already has a category library (`categories.json` + `{pdfId}.pdf` in Electron appData). Canvas sessions are a **sidecar** file per PDF.

---

## Product goals

1. **Library stays Libritus categories** — home / category grid / upload unchanged.
2. **Session per document** — while working on a PDF, persist all Excalidraw annotations + last reading position.
3. **PDF ↔ scene separation** — PDF bytes stay in `{pdfId}.pdf`; canvas image bytes stay in `attachments/`; the Excalidraw snapshot never includes pages, bitmaps, or attachment payloads — only elements + camera.
4. Open a PDF → load bytes from disk → restore snapshot (if any) → resume reading.
5. **Saved / Unsaved** visible in UI (also debugs the persistence pipeline).

Out of scope for this feature (see roadmap):

- Canonical page-space model (`pageIndex` + geometry) — v1 uses scene-space on purpose (PDF layout is stable); optional later — [`page-space-annotations.md`](page-space-annotations.md).
- Migrating legacy highlights/comments from `categories.json` into the session.
- LOD / thumbnails in IDB.

---

## Data model

### Document identity

Each PDF has a stable `pdfId` (UUID) from the existing upload flow in `stores/categories`.

### Layout on disk (Electron appData)

```
{appData}/
  categories.json            # catalog: categories → pdfs (metadata, legacy fields)
  {pdfId}.pdf                # PDF bytes
  {pdfId}.png                # thumbnail (existing)
  {pdfId}.session.json       # Excalidraw snapshot + camera (canvas)
  attachments/
    {fileId}.png             # canvas images (ext from mime; never in session JSON)
```

**Why disk, not IndexedDB:** desktop Electron app; large PDFs fit better as files; catalog already lives on disk.

**Canvas images:** Excalidraw `image` elements keep a `fileId` in the scene. Bytes live under `attachments/{fileId}.{ext}` — written on insert, reloaded via `addFiles` on open. The session snapshot never embeds `files`, dataURLs, or base64.

### `{pdfId}.session.json`

```ts
type SessionSnapshot = {
  version: 1
  docId: string // same as pdfId
  updatedAt: string
  camera: {
    scrollX: number
    scrollY: number
    zoom: number
  }
  /**
   * Serialized Excalidraw elements (highlights, notes, search captures, arrows, freehand…).
   * Never PDF pages or “document” shapes.
   */
  elements: unknown[]
  appState?: Partial<Record<string, unknown>>
}
```

**What goes in `elements`:** whatever Excalidraw has in the scene (`getSceneElements()`), filtered to exclude `isDeleted` when practical. The PDF is the `PdfLayer` underneath — not an element. Image elements store only `fileId` (bytes in `attachments/`).

WYSIWYG notes store Plate `plateValue` in `customData` on the note **embeddable** (`pdfNote: true`). No separate notes file — see [`wysiwyg-notes.md`](wysiwyg-notes.md).

Web search captures ([`web-search-capture.md`](web-search-capture.md)): placeholder `embeddable` until screenshot; after capture / restore with `fileId`, native Excalidraw `image` whose PNG lives under `attachments/` (same path as other canvas images).

**Camera:** persist `scrollX`, `scrollY`, `zoom` from the same channel that feeds `CameraState` (`onScrollChange`). On restore: load attachment bytes → `addFiles` → `updateScene({ elements, appState: { scrollX, scrollY, zoom } })` + sync camera refs.

### Relation to `categories.json`

| Concern | Source of truth |
|---------|-----------------|
| Title, category, thumbnail, legacy highlights/essays | `categories.json` |
| Live canvas counts (`canvasStats.highlights` / `notes` / `searches`) | Writebacked from session into `categories.json` (card pills) |
| Canvas annotations + reading camera | `{pdfId}.session.json` |

Legacy highlight/comment fields on `Pdf` are **not** written by the canvas MVP. Migration is a later task (see [`docs/roadmap.md`](../roadmap.md)).

---

## Flows

### A. Upload PDF (unchanged)

Existing `uploadPdf` → write `{pdfId}.pdf` + update catalog → navigate to viewer.

### B. Open from category

1. Route `/category/:categoryId/:pdfId` → `readFile('{pdfId}.pdf')` → `ArrayBuffer` → `PdfDocument.open`.
2. Clear Excalidraw scene before loading snapshot.
3. If `{pdfId}.session.json` exists: restore elements + camera; for any image `fileId`s, load `attachments/{fileId}.*` and `addFiles` before `updateScene`.
4. Else: initial camera.
5. Mark UI **Saved**.

### C. Save session (autosave + flush)

UI status: `Saved` | `Unsaved` | `Saving…` | `Error`.

| Event | Behavior |
|-------|----------|
| Element / camera change | Mark **Unsaved**; schedule save with **debounce 5 s** |
| New Excalidraw image file | Write bytes to `attachments/{fileId}.{ext}` immediately (not in session JSON) |
| Debounce fires | Write session JSON → **Saved** (or **Error**) |
| Leave route / open another PDF | **Immediate flush** if Unsaved |
| App close | Best-effort flush via `beforeunload` |

Payload: scene elements + camera → `{pdfId}.session.json` (no attachment bytes).

---

## Implementation notes

- Session helpers: `src/renderer/src/lib/pdf-canvas/session.ts`.
- Attachment helpers: `src/renderer/src/lib/pdf-canvas/attachments.ts`.
- Orchestration in `PdfCanvasApp` (dirty signature, debounce, restore generation counter, attachment persist/restore).
- Do not persist selection-only `onChange` noise — signature should ignore selection.

---

## Checklist

1. [x] `SessionSnapshot` type + read/write via Electron IPC.
2. [x] Open path restores session when present.
3. [x] Autosave 5s + flush on leave.
4. [x] Saved/Unsaved chip in UI.
5. [x] Atomic write (tmp + fsync + rename) in main `write-file` IPC — see `src/main/atomicWrite.ts`.
6. [x] Freeze session writes on canvas crash (`PdfCanvasErrorBoundary` + `sessionPersistFreeze`) so leave-flush cannot wipe disk.
7. [ ] Migrate legacy highlights into session (see [`legacy-migration-and-export.md`](legacy-migration-and-export.md)).
