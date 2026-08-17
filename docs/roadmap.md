# Roadmap — Infinite PDF Canvas

North star: Libritus as a **research canvas** — PDF as trigger, canvas as memory of the investigation. Product premises: [`docs/features/product-north.md`](features/product-north.md). Architecture: [`docs/architecture/infinite-pdf-canvas.md`](architecture/infinite-pdf-canvas.md). Agent conventions: [`AGENTS.md`](../AGENTS.md).

**Stack decision:** Excalidraw + virtualized EmbedPDF (PDFium) is the canvas. We are **not** building a custom camera / Pixi engine while Excalidraw works well. Scale work = host culling, pools, density, memory — not a renderer rewrite.

---

## v1 (current MVP)

- Replace lector-based `/category/:categoryId/:pdfId` with Excalidraw + virtualized EmbedPDF layer.
- Page pool, adaptive render density + CSS zoom, text select, locked highlights.
- WYSIWYG notes (Plate + `pdfNote` embeddables; place free or from highlight).
- Page navigator, find bar, outline + thumbs, annotation panel.
- Web search capture (Buscar / Place browser).
- Session autosave: `{pdfId}.session.json` (elements + camera).
- Keep existing categories library / upload / Electron FS.

**Explicitly deferred in v1:** reintroducing essays as a canvas research surface (legacy essays UI removed with lector).

Feature write-ups: [`wysiwyg-notes`](features/wysiwyg-notes.md), [`persistence-and-sessions`](features/persistence-and-sessions.md), [`pdf-navigation`](features/pdf-navigation.md), and the other “done” docs listed in [`AGENTS.md`](../AGENTS.md).

---

## v1.1

Feature specs (planned): [`reading-shortcuts`](features/reading-shortcuts.md) · [`essays-hud`](features/essays-hud.md) · [`page-space-annotations`](features/page-space-annotations.md) · [`legacy-migration-and-export`](features/legacy-migration-and-export.md) · [`navigation-history`](features/navigation-history.md).

Done in v1.1 so far: [`pdf-search`](features/pdf-search.md), [`outline-and-thumbnails`](features/pdf-outline-and-thumbnails.md), [`annotation-panel`](features/annotation-panel.md), [`pdf-rag-chat`](features/pdf-rag-chat.md) (Chat tab **unmounted**; RAG backend kept; Settings AI UI parked), [`web-search-capture`](features/web-search-capture.md), [`annotation-polish`](features/annotation-polish.md), [`adaptive-pdf-render-scale`](features/adaptive-pdf-render-scale.md) (Phase 1).

| Item                                  | Notes                                                                                                                                                                    |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Canonical annotation model (optional) | `pageIndex` + page-space geometry for layout-stable highlights/notes — Excalidraw stays paint/camera — [`page-space-annotations.md`](features/page-space-annotations.md) |
| Migrate legacy data                   | Map old `categories.json` highlights/comments into canvas session — [`legacy-migration-and-export.md`](features/legacy-migration-and-export.md)                          |
| Essays HUD                            | Reintroduce as **canvas research surface** (not PdfSidebar tab) — [`essays-hud.md`](features/essays-hud.md)                                                              |
| Reading shortcuts                     | PageUp/Down, fit page, etc. — [`reading-shortcuts.md`](features/reading-shortcuts.md)                                                                                    |
| Navigation history                    | In-memory page-jump history + clock popover (spec exists) — [`navigation-history.md`](features/navigation-history.md)                                                    |
| Library polish                        | Optional `contentHash`, rename, reveal in Finder                                                                                                                         |
| PDF RAG (today)                       | Local MiniLM + OpenRouter BYOK; Chat UI unmounted until canvas Q&A; **Settings AI UI parked** — [`pdf-rag-chat.md`](features/pdf-rag-chat.md)                  |

---

## Later — research on canvas (product debt)

Aligned with [`product-north.md`](features/product-north.md). **Do not** ship auto-summaries, auto-highlights, or auto-keywords.

| Item                                 | Notes                                                                                                                                                                                    |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Remove / keep-hidden sidebar AI Chat | Drop Chat from `PdfSidebar` permanently when canvas Q&A ships; do not deepen the silo                                                                                                    |
| AI Q&A → canvas cards                | Explicit ask → session artifacts (e.g. `pdfQa`); citations + deletable like other elements                                                                                               |
| Nav-only PDF sidebar                 | Destination: Outline + Pages only; decide Annotations / other research chrome then                                                                                                       |
| Canvas research artifacts            | Vocabulary, translations, YouTube / web embeds, cross-PDF links — first-class canvas types over time (search captures: done — [`web-search-capture.md`](features/web-search-capture.md); PDF clip annotation / library cites: [`pdf-clips.md`](features/pdf-clips.md)) |

---

## Scale / memory (stay on Excalidraw)

| Item                     | Notes                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------- |
| Hard visible-set cap     | **Done (v1)** — pools hard-capped at `poolSize`; `trimVisibleToCap` keeps nearest-to-center visible set |
| LOD / zoom-based density | Beyond Phase 1 adaptive scale — [`adaptive-pdf-render-scale.md`](features/adaptive-pdf-render-scale.md) |
| Evict release            | **Done (v1)** — zero canvas buffers on pool evict / dispose                                             |
| Spatial annotation index | Only if linear hit-test becomes a real cost                                                             |
| Streaming / range / OPFS | Do not keep entire PDF ArrayBuffer in main forever                                                      |
| Hi-res tiles             | Avoid giant GPU textures at high zoom                                                                   |

---

## Migration debt (from lector era)

Legacy shapes may still appear in `categories.json` but are **not** written by the canvas MVP:

- `Pdf.highlights` / comments / essays (typed in the store for load/display/mentions; migration to session is v1.1)
- Progress as scroll `offset` (replaced by session camera for canvas)

Plan: treat session JSON as the write path for new annotations; one-shot or lazy migrate legacy highlights when touching a document in v1.1.

---

## Guiding principles

> Performance is not defined by the whiteboard UI library, but by **page culling + LOD + sparse annotations**.

> Research lives on the **canvas**; AI only on **explicit ask** — never auto-summarize / auto-highlight / auto-keyword.

Excalidraw is the canvas stack. Improve the EmbedPDF host and product surfaces; do not plan a second engine by default.
