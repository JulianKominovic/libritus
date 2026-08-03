# PDF RAG chat (BYOK)

Ask questions about the open PDF using local embeddings + OpenRouter for answers.

**Status:** Implemented (open → serial embed queue in main, nav progress indicator, Settings AI key, `{pdfId}.rag.json`). **Chat tab is unmounted** from `PdfSidebar` until canvas Q&A lands; `PdfChatPanel` / RAG backend kept for that migration.

**UX note:** Chat-in-`PdfSidebar` is **legacy / unmounted** (not a hidden tab). Product north ([`product-north.md`](product-north.md)): lasting research (including AI Q&A) belongs on the **canvas**. Do not deepen the sidebar transcript silo.

---

## Product goals

1. Ask questions about the current PDF and get answers grounded in its text — **only on explicit Send / ask**.
2. Cite pages (`[p.N]` + clickable chips) and jump the camera.
3. **BYOK** OpenRouter for chat only — key never in `localStorage`.
4. **Local embeddings** (MiniLM) so indexing has no provider cost and PDF text stays on device.

Aligned with AI principles ([`product-north.md`](product-north.md)):

- No auto-summarize, auto-highlight, or auto-keyword features or CTAs.
- Background indexing is retrieval prep, not generative reading.
- Do not mount Plate AIKit in chat or canvas notes.

Out of scope:

- Chapter / global auto-summaries (not planned; conflicts with product north).
- OCR for scanned PDFs.
- Remote embedding providers.
- Plate AIKit / note-editor AI.
- Shipping canvas Q&A cards in this feature’s current implementation (destination only).

---

## UX (today)

| Surface                          | Behavior                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **Settings → AI**                | OpenRouter key (save / test / clear via `safeStorage` in main). Chat model select. Copy: embeddings run locally. |
| **Nav sidebar (above Settings)** | Active embed job + progress; queued PDF titles. Hidden when idle.                                                |
| **PdfSidebar → Chat**            | **Hidden** (panel code retained). Indexing still runs on PDF open; Settings AI unchanged.                        |
| **Without key**                  | Indexing still runs on PDF open; Send blocked with CTA to Settings.                                              |
| **Empty PDF text**               | “No extractable text”.                                                                                           |

Motion: short fade/slide on messages (~150ms); send `active:scale-[0.96]`; `tabular-nums` on pages/progress.

---

## Destination (later)

- Chat tab already hidden; delete `PdfChatPanel` when canvas Q&A ships.
- Explicit ask → canvas research cards (session artifacts, deletable, with citations).
- Prefer session / canvas as source of truth over `{pdfId}.chat.json` as primary UX.

---

## Pipeline

```
PDF open → EmbedPDF `extractText` → chunk → ai:rag-enqueue (main serial queue)
  → MiniLM embed → {pdfId}.rag.json
  → Chat: query embed → top-k cosine → OpenRouter stream → UI
```

| Piece            | Where                                                                                         |
| ---------------- | --------------------------------------------------------------------------------------------- |
| Key              | `src/main/ai/secrets.ts` + IPC `ai:set/has/clear-openrouter-key`                              |
| Embed + queue    | `src/main/ai/embedder.ts`, `ragIndexQueue.ts`, `ragIndex.ts`                                  |
| Chat stream      | `src/main/ai/chat.ts` → `ai:chat-chunk/done/error`                                            |
| Chunk / retrieve | `src/renderer/src/lib/pdf-canvas/pdfRag.ts`                                                   |
| Enqueue on open  | `PdfCanvasApp` → `ai:rag-enqueue`                                                             |
| Persist          | main writes `{pdfId}.rag.json` + `{pdfId}.rag.meta.json`; chat history via `pdfRagPersist.ts` |
| UI               | `EmbeddingJobsIndicator`, `PdfChatPanel`, Settings AI                                         |

Indexing is **idempotent**: disk fingerprint/model/chunk-count match → noop. Closing Chat/sidebar does **not** cancel. Leave PDF does **not** cancel. Delete PDF → `ai:rag-cancel`.

Embedding model: `Xenova/all-MiniLM-L6-v2` (384-d, q8). Chat model preference in Zustand (non-secret).

---

## Relation to other features

| Feature           | Interaction                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| **Outline**       | Chapter titles on chunks when TOC exists (wait for outline before enqueue). |
| **Search**        | Shares engine text extraction ideas; separate from find bar.                |
| **Notes / AIKit** | Do not mount Plate AI in chat or notes.                                     |
| **Product north** | Canvas owns research; sidebar Chat is temporary.                            |

---

## Follow-ups (not summaries)

- Stronger multilingual embed model + reindex.
- UtilityProcess if indexing blocks main on huge PDFs.
- Canvas Q&A cards when sidebar Chat is removed (roadmap).
