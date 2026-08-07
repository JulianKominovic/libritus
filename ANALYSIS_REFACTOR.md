# ANALYSIS_REFACTOR.md — Oportunidades de refactor en Libritus

> Estado: análisis read-only (investigación con citas). Sin cambios aplicados.
> Método: análisis estático de imports (BFS desde `src/renderer/src/main.tsx` + `pages/*`),
> `rg`/`diff`/`wc -l`, lectura de `AGENTS.md` y docs. Fecha: 2026-08-07.

## Resumen ejecutivo

1. **~12.270 líneas de código muerto/legacy en 95 archivos** — dominado por el stack de
   editor Plate "lector" (`components/editor` + `components/ui`, ~11.370 líneas), más un
   silo RAG/Chat aparcado, hooks/libs muertos.
2. **`PdfCanvasApp.tsx` es un god component** (2.762 líneas, 53 `useCallback`, 40 `useRef`,
   18 `useEffect`) — candidato #1 a extracción de hooks.
3. **Duplicación concreta**: `comment.tsx` copiado byte-a-byte en dos carpetas; dos context
   menus en paralelo; dos hooks de debounce; patrón PagePool/ThumbPool duplicado.
4. Código vivo pero voluminoso: `useSearchCaptureBrowser.ts` (531), `PdfSidebar.tsx` (503),
   `pdfSearchCapture.ts` (589), `web-browser.ts` (577).

⚠️ El código "muerto" del editor lector podría ser la base de la migración de legacy
(AGENTS.md Pending v1.1 "Migrate legacy highlights/comments/essays — Old lector model").
La decisión borrar-vs-migrar es de **producto**, no técnica. No asumir borrado.

---

## A. Código muerto / no alcanzable (95 archivos, ~12.270 líneas)

### A.1 Evidencia del análisis
- Script BFS sobre imports relativos + alias `@renderer/` (resuelve `from`, `import(...)`,
  imports side-effect), sembrando desde `main.tsx` y `pages/*`.
  Resultado: `total: 333, reachable: 237, UNREACHABLE: 95; unreachable total lines: 12270`.
- Desglose: `components/ui` 64 archivos (9.482 líneas) + `components/editor` 20 archivos
  (1.889 líneas); resto: `organisms/pdf-canvas` 2, `assets/illustrations` 1, `hooks` 4,
  `lib` 4.
- ⚠️ Limitación: análisis estático; no ejecuta la app. Validar con `knip`/`unimported`
  antes de borrar. `vite-env.d.ts` excluido (declaración); `excalidraw-asset-path.ts`
  **no** está muerto (side-effect import en `main.tsx:1`).

### A.2 Stack Plate "lector" legacy (la mayor parte muerta)
- **Source:** lista de no-alcanzables generada por BFS; kits `base-*` sí viven vía
  `NoteEmbed.tsx:1-4` → `editor-base-kit.tsx` / `note-editor-kit.tsx`.
- `note-editor-kit.tsx` importa 24 kits vivos (AlignKit… ToggleKit).
- **Sin importador** (dead): `plate-editor.tsx`, `editor-kit.tsx`, `plate-types.ts`,
  `settings-dialog.tsx`, `use-chat.ts` y plugins: `ai-kit`, `comment-kit`, `comment.tsx`,
  `copilot-kit`, `cursor-overlay-kit`, `discussion-kit`, `dnd-kit`, `docx-kit`,
  `fixed-toolbar-kit`, `floating-toolbar-kit`, `slash-kit`, `suggestion-kit`,
  `block-menu-kit`, `block-selection-kit`, `basic-nodes-kit`.
- 64 archivos de `components/ui` sin importador, incluidos: `accordion`, `ai-chat-editor`,
  `ai-menu`, `ai-node`, `ai-toolbar-button`, `alert`, `aspect-ratio`, `avatar`,
  `block-context-menu`, `block-discussion`, `block-draggable`, `block-suggestion`,
  `button-group`, `card`, `carousel`, `chat-container`, `code-block`, `collapsible`,
  `comment-node`, `comment-toolbar-button`, `comment`, `cursor-overlay`, `drawer`,
  `export-toolbar-button`, `fixed-toolbar-buttons`, `floating-toolbar(-buttons)`,
  `font-color-toolbar-button`, `font-size-toolbar-button`, `form`, `ghost-text`,
  `history-toolbar-button`, `import-toolbar-button`, `input-otp`, `kbd`, `label`,
  `line-height-toolbar-button`, `loader`, `markdown`, `media-toolbar-button`, `menubar`,
  `message`, `mode-toolbar-button`, `navigation-menu`, `pagination`, `prompt-input`,
  `radio-group`, `reasoning`, `resizable`, `response-stream`, `scroll-area`, `select`,
  `sheet`, `sidebar-right`, `sidebar`, `slash-node`, `sonner`, `suggestion-node`,
  `suggestion-toolbar-button`, `table`, `textarea`, `toggle-group`, `toggle`, `tool`.
- Git: la mayoría del stack nació en `76258c5 feat: essays`.

### A.3 Hooks / libs / assets muertos
- `hooks/use-debounce-function.ts`, `hooks/use-is-touch-device.ts`, `hooks/use-mobile.ts`,
  `hooks/use-mounted.ts`, `lib/date.ts`, `lib/get-strict-context.tsx`,
  `lib/markdown-joiner-transform.ts`, `assets/illustrations/writing.tsx`,
  `lib/pdf-canvas/pdfRagPersist.ts`.
- **Duplicación de debounce**: `use-debounce-function.ts` (dead) vs `use-debounce.ts`
  (vivo, usado por `emoji-node.tsx:9`).

### A.4 Silo RAG/Chat — aparcado (dead-by-design)
- `PdfChatPanel.tsx` (271 líneas), `usePdfRagChat.ts` (271), `pdfRagPersist.ts`: sin
  importadores.
- `EmbeddingJobsIndicator.tsx:13-16`: "RAG/embeddings currently disabled in main
  (`src/main/ai/index.ts`); this always stays idle until the feature is redone".
- `src/main/ai/index.ts:5-14`: bloque RAG comentado ("DISABLED… Do not re-enable by
  uncommenting alone").
- `settings.tsx:167`: `<AiSettingsSection />` comentado ("parked with RAG").
- Decisión: producto decide si se retira (AGENTS.md Later: "Retire Chat silo").

---

## B. God component: `PdfCanvasApp.tsx`

- **Source:** `wc -l` → 2.762 líneas; conteos `rg -c`: 53 `useCallback`, 40 `useRef`,
  18 `useEffect`; componente interno `PdfCanvasAppInner` líneas 215–2762 (~2.548 líneas).
- Mezcla dominios: sesión (`buildSnapshot` L631, `writeSnapshotNow` L648), highlights
  (`commitPendingHighlight` L1646), notas (`updateNotePlateValue` L1444), search capture
  (`useSearchCaptureBrowser`), navegación (`goToPage` L1491), arrows
  (`syncPdfNoteArrows`), toolbars.
- El comentario L200-214 documenta estado React mínimo ("Everything else is ref + DOM"),
  pero 40 refs/handlers centrales viven en un solo scope.
- **Refactor sugerido**: extraer hooks por dominio (persistencia, selection→highlight,
  search-capture, notas) y/o dividir el render. El render ya delega en `PdfLayer`,
  `PageNavigator`, `PdfSidebar`, `HighlightToolbar`, `BrowserChrome`, `PdfFindBar`.

---

## C. Duplicación concreta

1. **`comment.tsx` duplicado byte-a-byte** — `components/ui/comment.tsx` y
   `components/editor/plugins/comment.tsx` (576 líneas c/u); único diff en la línea 36:
   `'./editor'` vs `'@renderer/components/ui/editor'`. Ambos inalcanzables.
2. **Dos context menus** — `context-menu.tsx` (Radix, `//@ts-nocheck`) vs
   `context-menu-animated.tsx` (floating-ui + motion). Ambas **alcanzables**:
   home/category usan la animada; sidebar/settings/pdf-card usan la Radix. Unificar
   (la animada cubre los casos).
3. **Dos hooks de debounce** — `use-debounce.ts` (vivo) vs `use-debounce-function.ts`
   (dead).
4. **PagePool/ThumbPool** — mismo patrón (slots fijos, LRU `lastUsed`/`clock`,
   `evictUntil`/`evictOne`, `generation`, cancel) sin base compartida.
   - `PagePool.ts` L30–210 vs `ThumbPool.ts` L32–130.
   - AGENTS.md lo trata como convención ("same pool pattern: fixed slots, LRU, cancel,
     generation counter"). Con 2 consumidores, evaluar si vale la pena abstraer;
     **preservar el hard cap** (lección de memoria #8: "pool size is a hard budget now").
5. **`icons-data.ts`** — 13.504 líneas con `//@ts-nocheck`, import dinámico solo desde
   `icon-picker.tsx:69` (`await import('./icons-data')`). Alcanzable (no es dead code),
   pero conviene aislarlo o generarlo en build.

---

## D. i18n (menor)

- `translations-keys.ts:1-21` define union `TranslationsKeys` (20 claves) y `en.ts:3-25`
  reimplementa `Record<TranslationsKeys, string>` con las mismas claves.
- TS valida el Record contra el union (no es bug), pero agregar una clave toca 2+ archivos
  y el orden difiere (`info` al final en en.ts). Candidata a `satisfies` derivado de un
  único objeto.

---

## E. Archivos vivos grandes a vigilar

- `organisms/pdf-canvas/useSearchCaptureBrowser.ts` (531), `PdfSidebar.tsx` (503),
  `PdfLayer.tsx` (342), `usePdfRagChat.ts` (271 — dead, ver A.4).
- `lib/pdf-canvas/pdfSearchCapture.ts` (589), `pdfNotes.ts` (576).
- `main/web-browser.ts` (577).

---

## F. Señales de tipos forzados

- `@ts-ignore` en `components/ui/editor.tsx:7`; `@ts-nocheck` en `context-menu.tsx` e
  `icons-data.ts`; varios `as any` en `toolbar.tsx` (L311, L324, L344), `table-node.tsx`
  (L416, L540), `ai-menu.tsx` (L93-94), `callout-node.tsx` (L35, L56). No ejecuté
  typecheck (análisis read-only) — revisar si el stack legacy rompe `bun run build`.

---

## G. Conflictos / unknowns

- Reachability es estática: archivos referenciados por string/auto-registro (p.ej. nodos
  Plate) podrían estar vivos aunque el BFS diga lo contrario. Confirmar con
  `knip`/`unimported` antes de borrar.
- No ejecuté `bun run build`/`bun test` (rol read-only); los conteos y diffs son de
  lectura pura.
- `components/ui/*` vivos (button, badge, tabs, slider, switch, etc.) están en la lista
  alcanzable y **no** deben tocarse por estar dentro del dir legacy.

---

## H. Handoff

- **Product**: decidir destino del stack lector legacy (`components/editor` + nodos
  `components/ui`): migrar (v1.1 legacy-migration) o declarar borrado; ídem silo
  RAG/Chat (`PdfChatPanel`, `usePdfRagChat`, `pdfRagPersist`, `EmbeddingJobsIndicator`
  siempre idle, Settings AI comentado).
- **Implementer (si producto aprueba)**:
  1. Extraer hooks de `PdfCanvasApp.tsx` (persistencia / selection→highlight /
     search-capture / notas).
  2. Eliminar `comment.tsx` duplicado y `use-debounce-function.ts`.
  3. Unificar los dos context menus.
  4. Evaluar base compartida PagePool/ThumbPool preservando hard cap.
  5. Aislar/generar `icons-data.ts` en build.
  6. Correr `knip`/`unimported` para validar dead code antes de borrar.
