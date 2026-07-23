# PDF RAG chat (BYOK)

Chat with the open PDF using local embeddings + OpenRouter for answers.

**Status:** Implemented (open → serial embed queue in main, nav progress indicator, Chat tab, Settings AI key, `{pdfId}.rag.json`).

---

## Product goals

1. Ask questions about the current PDF and get answers grounded in its text.
2. Cite pages (`[p.N]` + clickable chips) and jump the camera.
3. **BYOK** OpenRouter for chat only — key never in `localStorage`.
4. **Local embeddings** (MiniLM) so indexing has no provider cost and PDF text stays on device.

Out of scope (MVP):

- Chapter / global summaries (phase 2 — reuse chunks).
- OCR for scanned PDFs.
- Remote embedding providers.
- Plate AIKit / note-editor AI.

---

## UX

| Surface | Behavior |
|---------|----------|
| **Settings → AI** | OpenRouter key (save / test / clear via `safeStorage` in main). Chat model select. Copy: embeddings run locally. |
| **Nav sidebar (above Settings)** | Active embed job + progress; queued PDF titles. Hidden when idle. |
| **PdfSidebar → Chat** | One-line index status; message list; prompt; citation chips → `onGoToPage`. |
| **Without key** | Indexing still runs on PDF open; Send blocked with CTA to Settings. |
| **Empty PDF text** | “No extractable text”. |

Motion: short fade/slide on messages (~150ms); send `active:scale-[0.96]`; `tabular-nums` on pages/progress.

---

## Pipeline

```
PDF open → pdf.js text → chunk → ai:rag-enqueue (main serial queue)
  → MiniLM embed → {pdfId}.rag.json
  → Chat: query embed → top-k cosine → OpenRouter stream → UI
```

| Piece | Where |
|-------|--------|
| Key | `src/main/ai/secrets.ts` + IPC `ai:set/has/clear-openrouter-key` |
| Embed + queue | `src/main/ai/embedder.ts`, `ragIndexQueue.ts`, `ragIndex.ts` |
| Chat stream | `src/main/ai/chat.ts` → `ai:chat-chunk/done/error` |
| Chunk / retrieve | `src/renderer/src/lib/pdf-canvas/pdfRag.ts` |
| Enqueue on open | `PdfCanvasApp` → `ai:rag-enqueue` |
| Persist | main writes `{pdfId}.rag.json` + `{pdfId}.rag.meta.json`; chat history via `pdfRagPersist.ts` |
| UI | `EmbeddingJobsIndicator`, `PdfChatPanel`, Settings AI |

Indexing is **idempotent**: disk fingerprint/model/chunk-count match → noop. Closing Chat/sidebar does **not** cancel. Leave PDF does **not** cancel. Delete PDF → `ai:rag-cancel`.

Embedding model: `Xenova/all-MiniLM-L6-v2` (384-d, q8). Chat model preference in Zustand (non-secret).

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **Outline** | Chapter titles on chunks when TOC exists (wait for outline before enqueue). |
| **Search** | Shares `getTextContent` / extract path ideas; separate from find bar. |
| **Notes / AIKit** | Do not mount Plate AI in chat or notes. |

---

## Phase 2

- Summaries (global / per chapter) via OpenRouter over existing chunks.
- Stronger multilingual embed model + reindex.
- UtilityProcess if indexing blocks main on huge PDFs.
