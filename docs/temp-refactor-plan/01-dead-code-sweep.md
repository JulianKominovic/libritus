# 01 — Dead code sweep (código muerto / legacy)

- **Estado:** EN PLANIFICACIÓN
- **Fuente:** `ANALYSIS_REFACTOR.md` secciones A.1–A.3, C.1, F, G.
- **Ownership (solo estos):** archivos muertos confirmados en `components/editor`,
  `components/ui`, `hooks`, `lib`, `assets/illustrations` — **excluyendo** el silo RAG
  (lo reclama `07`) y `context-menu.tsx` (lo reclama `03`).
- **Gate de producto:** ⚠️ El stack Plate “lector” legacy (≈11.370 líneas) podría ser la base
  de la migración v1.1 “Migrate legacy highlights/comments/essays” (AGENTS.md Pending).
  **Antes de borrar: confirmar con producto que es DELETE y no MIGRATE.** Si hay duda,
  mover los archivos a `src/legacy/` (sin importar desde app) en vez de borrarlos.

## Objetivo

Eliminar ~95 archivos / ~12.270 líneas no alcanzables, validado con knip (no solo BFS estático),
sin romper nada vivo (sobre todo la Nota WYSIWYG: `NoteEmbed` → `note-editor-kit` → kits).

## Pasos

### 0. Gate de producto
- Confirmar DELETE (no MIGRATE) del stack lector legacy. Si MIGRATE → plan en pausa.
- Confirmar el enfoque: borrar (`git rm`) vs mover a `src/legacy/`.

### 1. Instalar y correr knip (validación autoritativa)
- `bun add -D knip` y crear `knip.json` mínimo (entry points: `src/renderer/src/main.tsx`,
  `src/renderer/src/pages/*`; `include: ['files', 'dependencies']`; ignorar
  `vite-env.d.ts`, `excalidraw-asset-path.ts` que es side-effect import en `main.tsx:1`).
- Correr `bunx knip` y producir la **lista autoritativa** de archivos sin importadores.
- **Cruzar** con la lista BFS de `ANALYSIS_REFACTOR.md`. Diferencias = falsos positivos de BFS
  (string/auto-registro, p.ej. nodos Plate) → conservar esos archivos.
- `knip dependencies`: marcar deps de `@platejs/*`, `@radix-ui/*`, etc. que queden sin uso real
  (ojo: `note-editor-kit` usa muchos `@platejs/*`; `editor.tsx`/`editor-static.tsx` están vivos).

### 2. Clasificar la lista
- **Bloque A — editor legacy (candidatos a borrar si knip confirma):** `plate-editor.tsx`,
  `editor-kit.tsx`, `plate-types.ts`, `settings-dialog.tsx`, `use-chat.ts`, plugins muertos
  (`ai-kit`, `comment-kit`, `comment.tsx`, `copilot-kit`, `cursor-overlay-kit`,
  `discussion-kit`, `dnd-kit`, `docx-kit`, `fixed-toolbar-kit`, `floating-toolbar-kit`,
  `slash-kit`, `suggestion-kit`, `block-menu-kit`, `block-selection-kit`, `basic-nodes-kit`).
- **Bloque B — `components/ui` legacy (64 candidatos):** la lista de A.2 del análisis
  (`accordion`, `ai-chat-editor`, `ai-menu`, `ai-node`, `block-context-menu`,
  `block-discussion`, `block-draggable`, `block-suggestion`, `card`, `carousel`,
  `chat-container`, `code-block`, `comment-node`, `comment-toolbar-button`, `cursor-overlay`,
  `drawer`, `fixed/floating-toolbar(-buttons)`, `form`, `ghost-text`, `markdown`, `menubar`,
  `message`, `mode-toolbar-button`, `navigation-menu`, `pagination`, `prompt-input`,
  `radio-group`, `reasoning`, `resizable`, `response-stream`, `scroll-area`, `sheet`,
  `sidebar-right`, `slash-node`, `sonner`, `suggestion-node`, `suggestion-toolbar-button`,
  `table`, `toggle-group`, `textarea`, `tool`, `export-toolbar-button`, etc.).
- **Bloque C — hooks/libs/assets:** `use-debounce-function.ts`, `use-is-touch-device.ts`,
  `use-mobile.ts`, `use-mounted.ts`, `lib/date.ts`, `lib/get-strict-context.tsx`,
  `lib/markdown-joiner-transform.ts`, `assets/illustrations/writing.tsx`.
- **Bloque D — duplicados a borrar (no a dedupe):** `components/ui/comment.tsx` y
  `components/editor/plugins/comment.tsx` (copia byte-a-byte, ambos muertos, único diff L36),
  y `use-debounce-function.ts` (duplica `use-debounce.ts` que está vivo en `emoji-node.tsx:9`).

### 3. Borrar
- `git rm` de los archivos confirmados (historial intacto).
- Si MIGRATE/no-seguro: `git mv` a `src/legacy/…` manteniendo imports relativos **internos**
  al bloque (los archivos legacy no los importa la app, así que mover no rompe el bundle).

### 4. Deps huérfanas
- Según `knip dependencies`, quitar de `package.json` las deps sin uso tras el borrado
  (p.ej. `@platejs/comment`, `@platejs/docx`, `@platejs/discussion`, `@platejs/suggestion`,
  `@radix-ui/react-menubar`, `react-tweet`, `react-day-picker`, `input-otp`, etc. **solo** si
  knip las confirma sin uso). Verificar que `note-editor-kit` y `editor.tsx` no las necesiten.

### 5. Verificación
- `npm run typecheck` (debe quedar limpio; los `@ts-nocheck`/`@ts-ignore` del legacy
  desaparecen con los archivos).
- `bun test` (unit completo — PagePool/ThumbPool/pdfNotes/selectionToHighlights/etc.).
- `npm run build`.
- E2E selectivo: `notes.spec.ts` (Nota WYSIWYG viva), `session.spec.ts`, `highlights.spec.ts`,
  `autosave.spec.ts`.
- Smoke manual: crear/editar nota (Bold/Italic, listas, link), guardar sesión, recargar.

## Riesgos / no hacer
- **No** borrar `editor-base-kit.tsx`, `note-editor-kit.tsx`, `transforms.ts`, `editor.tsx`,
  `editor-static.tsx`, `custom-editor-styles.css`, ni kits vivos de `note-editor-kit`
  (nota-editor L1–27). knip los marcará usados; respetar.
- **No** borrar `components/ui/*` vivos (button, badge, tabs, slider, switch, dialog, dropdown-menu…).
- No asumir que el BFS es la verdad: knip manda. Cualquier archivo “muerto” que TypeScript
  no pueda compilar sin él = vivo.
- No tocar el silo RAG (`07`) ni `context-menu.tsx` (`03`).

## Definition of done
- knip con 0 archivos/deps no alcanzables salvo las exclusiones documentadas (RAG + `context-menu.tsx`).
- `typecheck` + `bun test` + `build` verdes; e2e de notas/sesión pasan.
- Lista de borrados + justificación adjunta en el PR.
