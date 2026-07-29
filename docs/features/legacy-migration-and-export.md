# Legacy migration and export

Bring old lector-era annotations into the canvas world, and let users get their work out of the app.

**Status:** planned — roadmap v1.1 (migration) / later for rich export.

---

## Product goals

### Migration

1. When opening a PDF that still has legacy `highlights` / comments / essays on `categories.json`, offer or automatically map them into the canvas session (and/or essay sidecar).
2. Do not double-import: mark migrated state so reopen is idempotent.
3. Prefer page-space targets if [`page-space-annotations.md`](page-space-annotations.md) has landed; otherwise best-effort scene placement with documented limits.

### Export

1. Export user work for one PDF: at least a Markdown (or plain text) dump of notes + highlight snippets + optional essay body.
2. Keep export read-only w.r.t. the PDF file (do not require rewriting the original PDF for v1 export).

Out of scope (for now):

- Round-trip import from arbitrary Markdown.
- Annotated PDF burn-in (flatten highlights into a new PDF) — possible later.
- Cloud sync / share links.

---

## Migration UX

| Path | Behavior |
|------|----------|
| **Auto on open** | If legacy present and session empty → import → write session → clear or flag legacy fields. |
| **Session already exists** | Do not overwrite canvas work; optional “Import legacy…” if legacy still present. |
| **Failure** | Leave legacy intact; show Error; do not delete catalog fields. |

---

## Export UX

| Action | Behavior |
|--------|----------|
| **Export…** | From canvas chrome or library entry. |
| **Formats (v1)** | Markdown download / save dialog via Electron. |
| **Contents** | Title, per-highlight text + page if known, note plain text, essay body. |

---

## Model / approach

### Legacy sources (`categories.json`)

Typed on the store for load/display historically:

- `Pdf.highlights` / comments
- essays
- progress `offset` (superseded by session camera — do not migrate offset if session camera exists)

### Write targets

| Legacy | Target |
|--------|--------|
| Highlights / margin comments | Session highlights + notes (`pdfHighlight` / `pdfNote`) or canonical page-space |
| Essays | Essay sidecar / HUD store ([`essays-hud.md`](essays-hud.md)) |
| Scroll offset | Ignore when `{pdfId}.session.json` camera exists |

Idempotency: e.g. `legacyMigratedAt` on session or a flag on the catalog entry.

### Export

Pure function: `elements` (+ essay file) → Markdown string. No need to mutate disk except the user-chosen output path.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **Persistence / sessions** | Migration writes session once; then canvas is source of truth. |
| **Page-space** | Best migration quality if canonical model lands first or in the same milestone. |
| **Essays HUD** | Needs a home for legacy essays before import. |
| **Annotation panel** | Imported items should appear like native ones. |

---

## Closed decisions (draft)

1. Never destroy legacy data until import succeeds and is acknowledged by flags.
2. Export v1 = Markdown/text, not annotated PDF.
3. Session camera wins over legacy scroll offset.
