# 07 — Retirar el silo RAG/Chat (aparcado)

- **Estado:** EN PLANIFICACIÓN
- **Fuente:** `ANALYSIS_REFACTOR.md` sección A.4 + AGENTS.md (Later: “Retire Chat silo”).
- **Ownership (solo estos):**
  - Renderer: `organisms/pdf-canvas/PdfChatPanel.tsx`, `organisms/pdf-canvas/usePdfRagChat.ts`,
    `lib/pdf-canvas/pdfRag.ts`, `lib/pdf-canvas/pdfRagPersist.ts`,
    `organisms/embeddings/EmbeddingJobsIndicator.tsx`, uso en `templates/sidebar.tsx`.
  - Main: `src/main/ai/*` (`index.ts`, `chat.ts`, `embedder.ts`, `ragIndex.ts`,
    `ragIndexQueue.ts`, `secrets.ts`, `ragIndexQueue.test.ts`).
  - Deps: `@huggingface/transformers`, `@openrouter/sdk`, `@ai-sdk/react`, `ai`, `jsdom`,
    `@mozilla/readability` — **solo** si quedan sin uso real tras el borrado.
- **Gate de producto:** ⚠️ Decidir **retirar** vs **mantener aparcado**. AGENTS.md lo marca
  “Later: Retire Chat silo”, y `EmbeddingJobsIndicator.tsx:13-16` + `src/main/ai/index.ts:5-14`
  documentan RAG disabled by design. No retirar sin el OK.

## Situación actual

- Renderer dead-by-design: `PdfChatPanel` (271), `usePdfRagChat` (271), `pdfRagPersist` sin
  importadores; `pdfRag.ts` solo lo importa `usePdfRagChat` (+ comentario en `PdfCanvasApp.tsx:64`).
- `EmbeddingJobsIndicator` **está vivo** en `sidebar.tsx:416` (siempre idle).
- Main: `src/main/ai/*` registra IPC RAG (bloque DISABLED/comentado en `index.ts`);
  `ragIndexQueue.test.ts` cubre la cola.
- `settings.tsx:167` deja el `<AiSettingsSection />` comentado — **no lo toques** (lo reclama `03`;
  es cosmético y puede quedar).

## Pasos (si producto aprueba RETIRAR)

1. **Renderer:**
   - `git rm` `PdfChatPanel.tsx`, `usePdfRagChat.ts`, `lib/pdf-canvas/pdfRag.ts`,
     `lib/pdf-canvas/pdfRagPersist.ts`.
   - `templates/sidebar.tsx`: quitar import L27 + `<EmbeddingJobsIndicator />` L416;
     `git rm` `EmbeddingJobsIndicator.tsx` (quedan sin consumidores).
   - `PdfCanvasApp.tsx:64`: quitar el import comentado de `pdfRag` (solo el comentario).
2. **Main:** decidir con producto si se borra todo `src/main/ai/*` o se deja el bloque DISABLED.
   - Si se borra: `git rm` `src/main/ai/*` (incl. tests de `ragIndexQueue`) y quitar el
     registro de IPC RAG en `index.ts`/main. Si se deja: documentar y cerrar sin borrar.
3. **Deps:** `rg` para confirmar cero uso de `@huggingface/transformers`, `@openrouter/sdk`,
   `@ai-sdk/react`, `ai`, `jsdom`, `@mozilla/readability` tras el borrado; quitar de `package.json`
   solo los confirmados (ojo: `@ai-sdk/react`/`ai` quizá usados por otros flujos — verificar).
4. **Tests:** `lib/pdf-canvas/pdfRag.test.ts` y `ragIndexQueue.test.ts` se borran con su fuente;
   `rag-chat.spec.ts` e2e ya está disabled (AGENTS.md) — no habilitar.
5. **Docs:** actualizar `AGENTS.md` tabla de features (RAG pasa de “parcial” a “retirado”) y el
   roadmap; si se retira del todo, tachar el entry de Chat.

## Verificación
- `npm run typecheck`, `bun test`, `npm run build`.
- E2E: `session.spec.ts`, `notes.spec.ts` (el sidebar sigue montando sin el indicator).
- Smoke: abrir PDF con sidebar → sin crash, sin indicador de embeddings.

## Riesgos / no hacer
- **No** re-habilitar RAG (no descomentar el bloque de `main/ai/index.ts` “aleluya”).
- **No** tocar `settings.tsx` (comentario `AiSettingsSection` queda — lo reclama `03`).
- No borrar `lib/pdf-canvas/pdfRag.ts` sin confirmar que `PdfCanvasApp` no lo importa de verdad
  (el import de L64 está comentado; verificar antes).
- No tocar archivos de otros planes.

## Definition of done
- Silo RAG retirado (renderer + main) o decisión explícita documentada de mantenerlo aparcado.
- Sidebar limpio, `rag-chat` sin rastro, deps huérfanas fuera, docs actualizadas, checks verdes.
