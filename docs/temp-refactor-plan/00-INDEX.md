# Planes de refactor — Libritus

> Base: [`ANALYSIS_REFACTOR.md`](../../ANALYSIS_REFACTOR.md) (análisis read-only, 2026-08-07).
> Cada plan es **una unidad de trabajo independiente** que un agente puede ejecutar en paralelo.
> Criterio de independencia: **conjuntos de archivos disjuntos** (ver matriz de ownership abajo).

## Cómo usar

1. Cada agente trabaja en su **propia rama** desde `main`, tocando **solo** sus archivos.
2. Los planes con gate de producto (`01`, `07`) esperan una decisión explícita antes de aplicar borrado.
3. Merge en cualquier orden. Si dos ramas tocan el mismo archivo (no debería pasar — ver matriz),
   mergear la de menor riesgo primero y rebasar la otra.
4. Verificación común en todos los planes:

```sh
bun install                        # si cambian deps
npm run typecheck                  # siempre
bun test                           # unit (bun:test), siempre
bun run test:e2e                   # e2e selectivo o completo si el plan lo pide
```

5. Reglas de oro del repo (`AGENTS.md`) que aplican a todos:
   - Nunca tocar/parchear Excalidraw (`node_modules`, patch-package, forks). Mitigar en el host.
   - No poner geometría de overlays en React state disparado desde `onChange` de Excalidraw (ref + DOM).
   - Nunca meter páginas PDF en el store de Excalidraw.
   - Light mode only (`dark:` prohibido).
   - Código/comentarios en inglés; docs pueden ir en español.
   - `pageIndex` 0-based en la app.
   - No romper `.pdf-text-pass` / pass-through (selector `[data-pdf-page]`).
   - Minimal scope: no refactors ni deps extra “porque lo óptimo lo pide”.

## Matriz de ownership (disjunto por diseño)

| Plan | Archivos propios (solo estos) |
| ---- | ----------------------------- |
| `01-dead-code-sweep.md` | Archivos muertos confirmados por knip en `components/editor`, `components/ui`, `hooks`, `lib`, `assets` (**excepto** silo RAG y `context-menu.tsx` — ver abajo). |
| `02-pdfcanvas-hooks.md` | `PdfCanvasApp.tsx` + **nuevos** archivos hook en `organisms/pdf-canvas/`. |
| `03-unify-context-menus.md` | `components/ui/context-menu.tsx` (delete), `context-menu-animated.tsx`, `pages/settings.tsx`, `organisms/pdf/pdf-card-context-menu-content.tsx`, `package.json`. |
| `04-i18n-single-source.md` | `i18n/translations-keys.ts`, `i18n/en.ts` (solo si no edita el mismo archivo que `03`; no toca `settings.tsx`). |
| `05-pool-shared-base.md` | `lib/pdf-canvas/PagePool.ts`, `lib/pdf-canvas/ThumbPool.ts` + nuevos archivos compartidos + sus `.test.ts`. |
| `06-icons-data-isolate.md` | `components/ui/icons-data.ts`, `components/ui/icon-picker.tsx` (+ script de generación nuevo). |
| `07-rag-chat-silo.md` | Silo RAG completo: renderer `PdfChatPanel.tsx`, `usePdfRagChat.ts`, `lib/pdf-canvas/pdfRag.ts`, `pdfRagPersist.ts`, `EmbeddingJobsIndicator.tsx`, uso en `templates/sidebar.tsx`; main `src/main/ai/*`; deps `@huggingface/transformers`, `@openrouter/sdk` (si quedan sin uso). |

## Exclusiones mutuas (para no pisarse)

- **Silo RAG** (renderer + main) lo reclama **solo** `07`. `01` debe **excluir** de su lista de borrado:
  `PdfChatPanel.tsx`, `usePdfRagChat.ts`, `lib/pdf-canvas/pdfRag.ts`, `lib/pdf-canvas/pdfRagPersist.ts`,
  `EmbeddingJobsIndicator.tsx`, `src/main/ai/*`. (knip los reportará como no alcanzables: ignorar).
- **`context-menu.tsx`** lo reclama `03` (hoy está vivo → knip no lo marca muerto). `01` no lo toca.
  Después de mergear `03`, ese archivo queda muerto → `01` puede limpiarlo como follow-up.
- **`settings.tsx`** lo reclama `03`. `04` y `07` **no** editan `settings.tsx`.
- **`components/ui/editor.tsx`, `editor-static.tsx`, `custom-editor-styles.css`, `editor-base-kit.tsx`,
  `note-editor-kit.tsx`, `transforms.ts` y todos los kits/nodes que `note-editor-kit` importa están
  **vivos** (Nota WYSIWYG vía `NoteEmbed`). `01` solo los borra si knip los confirma.

## Orden de merge sugerido (no obligatorio)

1. `03-unify-context-menus` y `04-i18n-single-source` (pequeños, bajo riesgo).
2. `05-pool-shared-base`, `02-pdfcanvas-hooks` (refactors de comportamiento idéntico).
3. `01-dead-code-sweep` y `07-rag-chat-silo` (borrado; esperar gate de producto; mergear al final
   para minimizar fricción con las ramas que todavía referencian archivos).

## Estados

Cada plan trae una sección `## Estado` al inicio. Valores: `EN PLANIFICACIÓN` → `LISTO` → `EN PROGRESO` → `HECHO` / `CANCELADO`.
