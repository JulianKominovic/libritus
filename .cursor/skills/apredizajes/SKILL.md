---
name: apredizajes
description: En este archivo se encuentran los apredizajes recaudados de los agentes. Aca escribimos errores que se han cometido y cómo se corrigieron o approaches que tomó el modelo de lenguaje pero no fueron los adecuados. Este archivo es mantenido y actualizado por el agente.
---

# Aprendizajes

En este archivo se encuentran los apredizajes recaudados de los agentes.

Aca escribimos solamente los errores cometidos o approaches erróneos que tomó el modelo de lenguaje en contra de lo que pidió el usuario.

No es un archivo de aprendizajes para usar siempre, sino que se usa para evitar tropezar dos veces con la misma piedra.

Este archivo es mantenido y actualizado por el agente.

### pdf.js 6: JBIG2 / scanned PDFs need `wasmUrl`

#### Descripción más detallada

PDFs escaneados (imágenes JBIG2/JPEG2000) abrían páginas en blanco con warnings: `#instantiateWasm: Ensure that the wasmUrl API parameter is provided`, `nulljbig2_nowasm_fallback.js`, `JBig2 failed to initialize`, `Dependent image isn't ready yet`. El worker ya estaba configurado; faltaba el directorio `pdfjs-dist/wasm/`.

#### Corrección

- Copiar `node_modules/pdfjs-dist/wasm` → `src/renderer/public/wasm` en `postinstall` (mismo patrón que fonts de Excalidraw).
- Envolver `getDocument` en `pdfjs.ts` con `wasmUrl`: en `http(s)` → `${location.origin}/wasm/` (no `document.baseURI` — con rutas `/pdf/…` caería en `/pdf/wasm/`); en `file:` → `new URL('wasm/', document.baseURI)` (como `EXCALIDRAW_ASSET_PATH`).

### Windows: create category no-op + no DevTools

#### Descripción más detallada

Tras arreglar titlebar/hash router, "Create category" no hacía nada. Causas: (1) `APP_DATA_DIR` no se creaba → `atomicWriteFile` ENOENT; (2) en Windows `fs.rename` no pisa el destino → falla al actualizar `categories.json`; (3) el `.then` del click tragaba el error. DevTools solo vía optimizer en `is.dev`, así que en el `.exe` no se podía inspeccionar.

#### Corrección

- `mkdir` del parent en `atomicWriteFile` + fallback unlink+rename en Windows.
- `fs.mkdir(APP_DATA_DIR)` al `ready`.
- F12 / Ctrl+Shift+I / Cmd+Option+I abren DevTools también empaquetado.
- `convertFileSrc` + protocol `asset:` con paths Windows (`asset:///C:/…`).

### Windows build: ARM por defecto + titlebar + file:// router

#### Descripción más detallada

`electron-builder --win` en Mac ARM genera **win-arm64**. En PCs x64 el installer falla o la app no abre (síntoma típico NSIS: "Falta el icono de acceso directo"). Además `description` larga en `package.json` corrompe el shortcut NSIS.

La ventana usa `titleBarStyle: 'hidden'` pensado para macOS (traffic lights). En Windows/Linux sin `titleBarOverlay` **no hay** min/max/close.

El renderer usa `useBrowserLocation` sobre `file://`. En Windows el pathname es `/C:/…/index.html` → las rutas `/` no matchean; los Links reescriben a `file:///C:/category/…` → home vacío / navegación muerta aunque el chrome se vea.

#### Corrección

- `build:win` → `--win --x64`; `win.target` NSIS x64; description corta; iconos NSIS explícitos.
- `titleBarOverlay` en win/linux (height 50); traffic lights solo en darwin; navbar `pl-20` (mac) / `pr-36` (win).
- `useHashLocation` cuando `location.protocol === 'file:'`.

### `sendWithPromise` null: text layer after PDF destroy

#### Descripción más detallada

Al reabrir/cambiar PDF (o durante tear-down), `destroyRuntimeSession` hacía `doc.destroy()` mientras `PdfLayer` seguía montado con el pool viejo. `pushCamera` / `syncVisible` llamaban `getPage` con el worker ya destruido → `TypeError: Cannot read properties of null (reading 'sendWithPromise')` en `Failed to build text layer`.

#### Corrección

- `PdfDocument.getPage` rechaza con `AbortException` si ya no está alive; `alive = false` al inicio de `destroy`.
- Pools: flag `destroyed` + bump de generation en `destroy`; `syncVisible` no-op; catch ignora gen stale / `AbortException`.
- Limpiar `sessionRef` / `setSession(null)` *antes* de destruir pools/doc.


#### Descripción más detallada

El test `text select at zoom ≠ 1` hacía Meta+wheel (zoom vía handler de text-select) y luego `mouse.down/move/up` sobre el span. `expectUnsaved` pasaba por el dirty del **camera** (zoom/scroll), no por un highlight. El session flush quedaba con `elements: []`.

Causa: con el PDF layer en `transform: scale(z)`, el drag sintético de Playwright no crea `window.getSelection()` (collapsed). `elementFromPoint` sí pega en el span; un `Range` vía JS sí selecciona; el handler de `mouseup` funciona si ya hay selección.

#### Corrección

En e2e a zoom ≠ 1: `selectNodeContents` + `mouseup` sintético en `[data-pdf-canvas-root]` (no `mouse.down` — colapsa la selección). Afirmar toolbar **Add note** visible (highlight creado + HighlightToolbar), no solo Unsaved. (Ya no hay modo Select text / `aria-pressed`.)

### `resolveNoteFill`: `document` sin `getComputedStyle` en bun:test

#### Descripción más detallada

`resolveNoteFill` solo checaba `typeof document === 'undefined'`. En bun:test `document` existe (DOM parcial) pero `getComputedStyle` no → `ReferenceError` y fallan todos los tests de `pdfNotes`.

#### Corrección

Guardar también `typeof getComputedStyle === 'undefined'` y caer a `NOTE_FILL_FALLBACK`.

### Tokens `bg-light*` / `text-dark*` sin definir en CSS

#### Descripción más detallada

Varios primitivos shadcn (`card`, `select`, `dialog`, `command`, `navigation-menu`, etc.) usaban clases como `bg-light-muted`, `text-dark`, `border-dark-muted/10` y `shadow-note-card`, pero esos tokens nunca existieron en `App.css`. El resultado era superficies inconsistentes o estilos que Tailwind no resolvía.

#### Corrección

Reemplazar directamente por tokens morphing (`bg-morphing-100`, `text-morphing-900`, `border-morphing-300`) y definir `.shadow-note-card` en `App.css` con sombras tintadas al palette morphing.

### Dark mode shadcn vs regla light-only del proyecto

#### Descripción más detallada

El template shadcn traía `@custom-variant dark`, bloque `.dark { ... }` en `:root` y prefijos `dark:` en ~25 componentes. El proyecto tiene regla explícita de no soportar dark mode, así que esas clases eran código muerto y fuente de inconsistencia.

#### Corrección

Eliminar variant dark de `App.css`, quitar `THEMES.dark` de `chart.tsx`, y strip de todos los `dark:` en primitivos UI y editor. Mantener solo estilos hljs light en code blocks.

### Theme morphing sin reset entre rutas

#### Descripción más detallada

`setGlobalTheme()` se llamaba al entrar a una categoría, pero `resetGlobalTheme()` nunca se invocaba al salir. El tint de color de categoría persistía en home, settings y otras rutas.

#### Corrección

Hook `useRouteTheme()` en `App.tsx` que llama `resetGlobalTheme()` cuando la ruta no coincide con `/category/:id` (incluye PDF reader dentro de categoría, que sí mantiene el tint).

### Settings page fuera del design system

#### Descripción más detallada

`settings.tsx` era la única página usando `neutral-*` hardcoded con filas custom (`border-neutral-300 bg-neutral-200`) en lugar del contrato morphing del resto de la app.

#### Corrección

Migrar a `morphing-*`, `text-muted-foreground`, `text-destructive` para warnings, y filas con `rounded-xl border border-morphing-300 bg-morphing-100 p-3`.

### Excalidraw `onChange` → `setState` → loop infinito (repetido 2×)

#### Descripción más detallada

En el HUD de notas WYSIWYG (`NoteLayer` / `PdfCanvasApp`), sincronizar posición u overlays con `setState` desde `Excalidraw.onChange` (o desde algo que ese `onChange` dispara en cada drag/pan) produce:

`onChange` → `setVisibleNotes` / re-render del padre → Excalidraw vuelve a emitir `onChange` → otra vez `setState` → `Maximum update depth exceeded`.

Pasó **dos veces** en la misma feature: (1) al montar el sync de notas visibles con estado React en cada `onChange`; (2) al “arreglar” con equality check pero seguir metiendo geometría (`left`/`top`/`width`/`height`) en ese estado — al mover la nota cada frame cambiaba la geometría, el bailout no alcanzaba y el loop volvía.

El patrón del canvas (`PdfCanvasApp`) ya era ref + DOM para cámara/toolbar; ignorarlo fue el error.

#### Corrección

- **No** poner geometría de overlays en React state ligada a `onChange` de Excalidraw.
- Posición: DOM imperativo (`NoteLayer.applyGeometry` / mismo estilo que `highlightToolbarRef`).
- React state solo para identidad/contenido de notas (ids + `plateValue`), y solo cuando eso realmente cambia.
- Comparar antes de `setState` no basta si el valor comparado cambia en cada drag.

### Auto-activar edición al crear nota → drag bloqueado

#### Descripción más detallada

Se pidió editar con **doble click** (click simple = seleccionar/mover en Excalidraw). Al crear nota (Place note / Add note) el agente igual llamaba `setActiveNote(id)`, lo que pone el HUD en `pointer-events-auto` encima del placeholder. Resultado: arrastrar la nota nueva no hace nada porque Plate se come los eventos.

#### Corrección

Al crear: solo `selectedElementIds` en Excalidraw. `setActiveNote` únicamente en doble click sobre la nota.

### NoteStaticBody: `usePlateEditor` + `PlateStatic` → crash de hooks

#### Descripción más detallada

`usePlateEditor` inyecta siempre `NavigationFeedbackPlugin`, cuyo `inject.nodeProps.transformProps` llama `useNavigationHighlight` → `usePlateStore`. Eso requiere `<Plate>`. `EditorView` **y** `EditorStatic`/`PlateStatic` ejecutan ese inject; cambiar solo a `EditorStatic` no basta.

#### Corrección

Para HUD read-only: `createSlateEditor({ plugins: BaseEditorKit, value })` + `EditorStatic` (como export HTML). No usar `usePlateEditor` sin `<Plate>`.

### Doble click nota + full `EditorKit` → Maximum update depth

#### Descripción más detallada

`NoteEditableBody` montaba el `EditorKit` completo (AI/Copilot). `aiChatPlugin.useHooks` → `useChat()` hace `setOption(AIChatPlugin, 'chat', { ...chat })` en un effect dependiente de `chat`. Cada `setOption` re-renderiza → nuevo objeto `chat` → otra vez `setOption` → loop infinito al entrar en edit.

#### Corrección

Usar `NoteEditorKit` (mismo schema base, sin AI / collab / toolbars fijas). No montar `AIKit` dentro del HUD del canvas.

### Placeholder `backgroundColor: transparent` → centro intargeteable

#### Descripción más detallada

Síntoma: arrastrar la nota por el **borde** funciona; por el **medio** no (como si el centro no existiera). Causa: Excalidraw, con fill transparente, solo hace hit-test del **stroke**, no del interior del rectángulo.

El agente perdió tiempo con z-index / poner el HUD debajo de Excalidraw. Eso no era el bug: los bordes ya recibían eventos.

#### Corrección

- Placeholder con fill sólido (`#fff3bf` / `NOTE_FILL`), nunca `transparent`.
- HUD encima con `pointer-events-none` (+ `[&_*]:pointer-events-none` en reposo; `pointer-events` no se hereda).
- Parchear notas legacy al abrir sesión (`ensureNoteFill`).

### E2E Plate note: Escape / type race

#### Descripción más detallada

`NoteLayer` hacía `stopPropagation` en `keydown` del HUD, así que `page.keyboard.press('Escape')` **no** llegaba al listener de `window` en `PdfCanvasApp`. Además, tras dblclick, el effect de caret de `NoteEditableBody` corría async y pisaba el selection si se tipeaba al toque → texto mangled (`beforlate-persist…`).

#### Corrección

- Notas migraron a embeddable + `NoteEmbed`: Escape llama `onExitEdit` → `activeEmbeddable: null` (keyboard.press funciona).
- Tras abrir edit: esperar ~400ms, luego `ControlOrMeta+A` + `pressSequentially`.
- Activar embed: click en el **centro de la card** (`[data-pdf-note]`), no solo el bounding box del texto (Excalidraw exige el tercio central).

### Toolbar click → note exits edit (read-only)

#### Descripción más detallada

Al editar una nota (embed activo) y tocar Bold/Italic en la toolbar, la nota pasaba a modo lectura. Causa: Excalidraw habilita `pointer-events` del embed solo si `activeEmbeddable.element === sceneEl` (**igualdad por referencia**). `updateNotePlateValue` / `stripPdfNoteLinks` hacen `updateScene` con un objeto nota nuevo → `isActive` queda false → clicks de la toolbar caen en el canvas interactivo → Excalidraw limpia `activeEmbeddable`.

#### Corrección

- Tras reemplazar la nota en `updateScene`, reasignar `activeEmbeddable: { element: updated, state: 'active' }`.
- CSS: embed con `[data-pdf-note][data-editing]` a `z-index: 3` y `pointer-events: all !important` en el inner (por encima del canvas z-index 2).
- Salida de edit solo Escape / click fuera (comportamiento nativo al limpiar `activeEmbeddable`).

### `convertToExcalidrawElements` + `type: 'embeddable'` incompleto

#### Descripción más detallada

En Excalidraw 0.18, `convertToExcalidrawElements` para `embeddable`/`iframe`/`freedraw` hace `s = skeleton` sin pasar por `newEmbeddableElement`. Un skeleton parcial entra a la escena sin campos requeridos → place/Add note no marca Unsaved / no renderiza.

#### Corrección

Crear nota como `rectangle` completo vía `convertToExcalidrawElements`, luego `normalizePdfNote` → `embeddable` + `libritus://pdf-note`.

### ToolbarSplitButton → `<button>` anidado (validateDOMNesting)

#### Descripción más detallada

`ToolbarSplitButton` era un wrapper de `ToolbarButton`. Con `pressed={boolean}` ese path renderiza `ToolbarToggleItem` (`<button>`). Dentro, `DropdownMenuTrigger` + `ToolbarSplitButtonSecondary` es otro `<button>` → React: `<button> cannot be a descendant of <button>` (hydration warning en la toolbar de notas / listas).

#### Corrección

`ToolbarSplitButton` es un `<div role="group">` con `data-pressed` / estilos de pressed. Primary (span) + Secondary (button) quedan hermanos, no anidados.

### Autosave 5s nunca dispara (firma con `versionNonce`)

#### Descripción más detallada

`markUnsaved` usa `persistSignature` sobre `sceneElementsForPersist` → `normalizePdfNote`. Ese path llamaba `newElementWith` para restaurar el `link` de la nota, y Excalidraw regenera `versionNonce`/`updated`/`version` en **cada** llamada. Cada `onChange` (aunque la escena no cambie) veía una firma distinta → `shouldMarkDirty` → dirty → reinicio del timer de 5s. El chip quedaba en Unsaved hasta timeout del e2e.

El agente descartó el fallo del e2e (`expectSaved` timeout) porque una corrida aislada pasó (flake: a veces Excalidraw deja de emitir `onChange` el tiempo suficiente).

#### Corrección

- `persistSignature` ignora `version` / `versionNonce` / `updated`.
- `normalizePdfNote` en embeddables restaura `link`/fill con spread, no `newElementWith` (solo el migrate rectangle→embeddable sigue con `newElementWith`).

### Paste/Cmd+D nota + undo → nota huérfana en el canvas

#### Descripción más detallada

Tras validar el embed, `clearPdfNoteLinkForUi` deja `link: null` (`CaptureUpdateAction.NEVER`) para ocultar el icono de link. Copy/paste o Cmd+D copia esa nota stripped. `repairUnvalidatedPdfNotes` en `onChange` rematerializaba con un **UUID nuevo** + `NOTE_EMBED_LINK` vía `updateScene(NEVER)`. Undo solo revierte el paste de Excalidraw (id viejo); el id rematerializado no está en el history → la nota pegada queda en el canvas.

#### Corrección

Restaurar `NOTE_EMBED_LINK` en Excalidraw `onDuplicate` con `fixDuplicatedPdfNotes` (mismo id, misma transacción undoable). No rematerializar con id nuevo + `NEVER` para el path de paste/duplicate. `repairUnvalidatedPdfNotes` queda solo como red de seguridad.

### PdfSidebar tab inicial: outline async llega tarde

#### Descripción más detallada

Con `showPdfOutline: true`, el sidebar monta cuando hay `session` pero `loadOutline` aún no resolvió → `useState(outline.length > 0 ? 'outline' : 'pages')` queda en **Pages**. Cuando llega el outline, el tab no cambia. El e2e `outline entry and thumb jump` espera el botón `Go to Chapter Two` (en el tab Outline oculto) y hace timeout. Antes el sidebar se abría con un toggle *después* de cargar, así que a veces el outline ya estaba listo al montar.

#### Corrección

`useEffect` que, si `outline.length > 0` y el tab actual es `pages`, pasa a `outline` (no pisa Annotations ni un tab ya elegido).

### Sidebar DnD: `isDropTarget` sticky tras dragleave

#### Descripción más detallada

Al arrastrar un PDF de la lista de categoría sobre otra categoría en la sidebar y salir sin soltar, el highlight (`bg-morphing-100` + padding) quedaba indefinidamente. Se estilizaba con `isDropTarget` de `@minoru/react-dnd-treeview`, que refleja `placeholderContext.dropTargetId` — solo se limpia en `drop` o en `hover` mientras sigue `isOver`. Al hacer leave, no se llama `hidePlaceholder`.

#### Corrección

Usar `classes.dropTarget` del Tree (la lib lo aplica solo con `isOver` live). No estilar con `isDropTarget`. E2E: hover → leave → up limpia `.sidebar-drop-target`; drop completo mueve el PDF.

### Note hover: nunca patchear Excalidraw

#### Descripción más detallada

Hover sobre el tercio central de una nota (hint "Click to interact") dispara `setState(activeEmbeddable: hover)` en **cada** pointermove (Excalidraw 0.18.1, sin guard) → re-render completo + `onChange`.

Early-return en `handleExcalidrawChange` + `React.memo(NoteEmbed)` cortan el amplificador de Libritus pero no el `setState` interno.

**Regla dura:** nunca patchear Excalidraw. Ni `node_modules`, ni `patch-package` / postinstall, ni forks locales “solo este bug”, ni editar el bundle. Si el bug está adentro, se mitiga en el host (eventos, wrappers, props públicas) o se vive con él / se reporta upstream.

#### Corrección

En el host: capture `pointermove` sobre el wrapper de Excalidraw y `stopPropagation` cuando el cursor está en el tercio central de una pdf-note (misma geometría que Excalidraw), sin botones pulsados. Así el canvas no recibe esos moves → no hay hover setState. `pointerdown`/`up` siguen llegando (click-to-edit). Bordes siguen draggable.

### PdfSidebar tapa toolbar: e2e debe cerrar el panel

#### Descripción más detallada

`PdfSidebar` (`z-100`) cubre a propósito la toolbar centrada (`z-10`). Subir z-index de la toolbar o bajar el sidebar rompe ese diseño. Playwright falla al clickear Select text / Place note: “Go to page 1 … intercepts pointer events”.

#### Corrección

En e2e que necesitan la toolbar: cerrar el PDF sidebar (`Toggle PDF sidebar`) antes del click, o `{ force: true }` si el overlay es intencional y el botón sigue en el DOM.

### Add note arrow: flecha recta + endBinding sigue explotando

#### Descripción más detallada

La flecha highlight→nota crecía ~1e5px al mover la nota. El primer fix cambió elbow→flecha recta locked con `endBinding` (sin `fixedPoint`), asumiendo que solo el router elbow era el culpable. El síntoma siguió: `updateBoundElements` al arrastrar el embeddable también rompe conectores one-sided.

#### Corrección

Sin bindings de Excalidraw. Flecha `customData.pdfNoteArrow` + `noteId`/`startX`/`startY`, `locked`, host `syncPdfNoteArrows` en `onChange` y al restaurar sesión. Migrar flechas legacy con `endBinding` a ese formato.

### E2E sidebar: `showPdfOutline` leak vía Electron userData

#### Descripción más detallada

`LIBRITUS_APP_DATA_DIR` aísla PDFs/sessions, pero el zustand `settings` vive en `localStorage` del **userData por defecto** de Electron (`~/Library/Application Support/Electron` al lanzar el binario sin empaquetar). Tests que llaman `closePdfSidebar` persisten `showPdfOutline: false`. Suites posteriores (annotation-panel, outline-thumbs, rag-chat) abren el PDF y no encuentran `aria-label` del sidebar → timeout 10s. Parecía un cambio de label; el regex `/Document outline/` también fallaba porque el aside no montaba.

#### Corrección

Con `LIBRITUS_APP_DATA_DIR` set: `app.setPath('userData', …)` **antes** de `ready`, para que cada e2e tenga localStorage fresco (default `showPdfOutline: true`). Selectores e2e: `getByLabel(/Document outline/)` (el label completo incluye chat).

### RAG embeddings: no atar el job al mount del Chat/sidebar

#### Descripción más detallada

`usePdfRagChat` hacía `ensureIndex` al montar Chat y `genRef++` al desmontar. Cerrar sidebar/tab descartaba vectores **antes** de `writeRagIndex` → al reabrir se re-embebia todo. Main seguía trabajando; el renderer tiraba el resultado.

#### Corrección

Cola serial en main (`ragIndexQueue` + `ai:rag-enqueue`). Enqueue al **abrir** el PDF; persist en main; UI solo se suscribe (`ai:rag-queue`). Cerrar Chat/sidebar no cancela. Cancel solo al borrar PDF.

**Follow-up OOM:** no releer `{pdfId}.rag.json` en cada tick de progreso (IPC `read-file` + MiniLM → `ERR_MEMORY_ALLOCATION_FAILED`). Status vía snapshot/`lastFinished` + `{pdfId}.rag.meta.json`; el índice completo solo al Send.

### E2E cascade Remove: no Add note → re-click highlight

#### Descripción más detallada

Tras Add note, Excalidraw selecciona la nota (`selectedElementIds`). Un segundo `clickScene` sobre el highlight no abre el toolbar Remove (timeout 10s). Probable: selección/embed/cámara interfiere con el hit del highlight locked.

#### Corrección

Para e2e de cascade delete: seedear highlight + note (`sourceHighlightId`) + arrow (`pdfNoteArrow`/`noteId`) en la sesión y solo hacer Remove. Cubrir el path de delete sin el round-trip UI de Add note.

### Highlight recolor + undo delete → color default (fucsia)

#### Descripción más detallada

Recolorear con el toolbar aplicaba bien en pantalla, pero tras Remove + Cmd/Ctrl+Z el highlight volvía en `#FF00FF`. `setHighlightGroupColor` hacía `{ ...el, backgroundColor }` sin bump de `version`/`versionNonce`. El Store de Excalidraw solo calcula deltas / actualiza snapshots cuando cambia `versionNonce`, así que el recolor no entraba al historial; el undo del delete restauraba el snapshot pre-recolor (fill default).

#### Corrección

Usar `newElementWith(el, { backgroundColor })` en `setHighlightGroupColor` (igual que el delete). Assert en unit test de que `versionNonce` cambia.

### Lazy-load rutas / transformers: bundle initial grande

#### Descripción más detallada

`App.tsx` importaba estáticamente `PdfPage` → `PdfCanvasApp` (Excalidraw + Plate + pdf.js) aunque Home no los use. Además `react-scan` corría con `dangerouslyForceRunInProduction: true`, y `main.tsx` inicializaba pdf.js en el entry. Main cargaba `@huggingface/transformers` / jsdom al registrar IPC.

#### Corrección

- `React.lazy` para pdf/settings/category + `Suspense`; Home eager.
- `react-scan` solo si `import.meta.env.DEV`.
- Worker en `pdfjs.ts` (upload de thumbs también usa `getDocument`); `pdf_viewer.css` en `PdfDocument.ts`.
- Dynamic `import()` de transformers / jsdom / readability en el primer uso.
- `build.sourcemap: false` explícito en electron-vite (prod ya no generaba `.map`).

### Note edit Cmd+X: `onKeyDown` stopPropagation no basta

#### Descripción más detallada

Al editar una nota (Plate contenteditable) y tocar Cmd+X, Excalidraw cortaba/eliminaba el embed. `NoteEditableBody` ya hacía `stopPropagation` en React `onKeyDown`, pero Excalidraw registra listeners nativos de `cut`/`copy` en `document`. Solo hace bailout si `isWritableElement(target)` (input/textarea/`data-type="wysiwyg"`) — un contenteditable de Plate **no** califica → `actionCut` borra la nota seleccionada.

#### Corrección

En `NoteEditableBody`: `stopPropagation` también en `onCut` / `onCopy` / `onPaste` / `onKeyUp` (sin `preventDefault` en clipboard — Plate debe cortar texto). Escape sigue saliendo de edit + `stopPropagation`. E2E: `Cmd+X while editing cuts text, not the note embed`. No marcar Plate como `wysiwyg` (convención privada de Excalidraw) ni parchear Excalidraw.

### Web search: no `<webview>` dentro del embeddable de Excalidraw

#### Descripción más detallada

La UX pedía un embed “como las notas” con browser vivo en modo edición y screenshot en lectura. Meter `<webview>` (o iframe) en `renderEmbeddable` choca con el `transform` de pan/zoom de Excalidraw (hit-test / nitidez / bounds) y Electron desaconseja el tag. El doc de feature ya lo marcaba out of scope.

#### Corrección

Híbrido: embeddable en canvas (placeholder / PNG) + un solo `WebContentsView` en main alineado en screen-space a la bbox del shape. Al desactivar: `capturePage` → `attachments/` → lectura = imagen. No GC de PNGs huérfanos.

### Web search: `ERR_FAILED` al abrir Google (activeEmbeddable race)

#### Descripción más detallada

Al activar el capture, `openSearchBrowser` hacía `loadURL` y el `WebContentsView` robaba el foco. Excalidraw limpiaba `activeEmbeddable` → el host interpretaba “salida de edit” y llamaba `browser:deactivate` (detach) a mitad del load → `Error: ERR_FAILED (-2) loading 'https://www.google.com/...'`.

#### Corrección

La sesión del guest la posee `activeBrowserCaptureIdRef`, no `activeEmbeddable`. Abrir al activar un capture; cerrar solo con Escape, click fuera del shape (pointerdown en el host Excalidraw), o al activar una nota. No desactivar solo porque `activeEmbeddable` pasó a null.

### Web search: WebContentsView → child BrowserWindow

#### Descripción más detallada

Aun sin el race de `activeEmbeddable`, `WebContentsView` + `removeChildView` / foco seguía abortando `loadURL` con `ERR_FAILED` dentro de Libritus (en un script mínimo example.com/Google sí cargaban). El catch de `getURL` sobre `webContents` undefined empeoraba el síntoma.

#### Corrección

Guest = `BrowserWindow` hijo (`frame: false`, `parent`, partition `persist:web-browser`), bounds en screen DIP desde `getContentBounds()` + coords del renderer. Mismo IPC. Hide on deactivate (capturePage); destroy on close. Grace 800ms al abrir para no cerrar con el click de activación.

### Web search: chrome HUD `setState` → Maximum update depth

#### Descripción más detallada

Al activar un search capture, `handleExcalidrawChange` llamaba `syncActiveBrowserBounds` → `setBrowserChrome({ left, top, width })` en **cada** `onChange`. Objeto nuevo siempre → re-render del padre → Excalidraw `setState` → otro `onChange` → `Maximum update depth exceeded` (stack en `forceStoreRerender` / Excalidraw store).

Es el mismo antipatrón que el HUD de notas: geometría de overlay ligada a `onChange` vía React state. El highlight toolbar ya evitaba esto con DOM imperativo.

#### Corrección

Chrome siempre montado (`hidden` por default) + `browserChromeRef`; posición/visibilidad con `style.left/top/width/display` (como `highlightToolbarRef`). Sin `useState` para bounds.

### Sidebar DnD: no usar `NativeTypes.HTML` para cards PDF

#### Descripción más detallada

Las PDF cards de categoría usaban `useDrag({ type: NativeTypes.HTML })`. `HTML5Backend.isDraggingNativeItem()` trata ese type como drag nativo: un `dragleave` “final” llama `endDragNativeItem` en el próximo tick y puede matar el drag antes del `drop`. El e2e veía `.sidebar-drop-target` (hover) pero el PDF no se movía (`1 pdfs` sticky).

#### Corrección

Tipo custom `libritus/pdf-card` en card + `extraAcceptTypes` del Tree. `movePdf` solo si el item es un PDF card / nodo P. E2E reintenta hasta ver `0 pdfs`.

### Web search: deactivate sin PNG en el canvas

#### Descripción más detallada

Al salir del guest, PNGs válidos aparecían en `attachments/` y `customData.fileId` llegaba a la session, pero la card seguía en rectángulo gris.

Causa raíz: Excalidraw `embedsValidationStatus` se setea **una sola vez**. Si la primera validación falla (p.ej. link stripped) queda sticky-false → `renderEmbeddables()` filtra el elemento → `SearchCaptureEmbed` **nunca monta**. `publishCaptureFileId` / fresh-id no bastaron de forma fiable en la práctica.

#### Corrección

- Tras `capturePage`: `loadBinaryFiles` + `addFiles` y promover el shape a Excalidraw **`image`** nativo (`applySearchCaptureScreenshot`). El canvas siempre pinta images; no pasa por `embedsValidationStatus`.
- Placeholder sin screenshot sigue siendo embeddable.
- Activar browse: center-click en el host (sirve para embeddable e image); ya no depende de `activeEmbeddable`.
- `normalizePdfSearchCapture`: si hay `fileId`, asegura `type: 'image'` (migra sessions viejas embeddable+fileId).

### Web search: click en chrome entierra el guest

#### Descripción más detallada

Al hacer click en −/+ (u otros botones) de la barra chrome del host, el guest `BrowserWindow` (frameless, sin `parent:`) perdía el z-order: el host pasaba al frente y tapaba la webview. Parecía que se “cerraba” el browse.

#### Corrección

Mientras el guest está visible: `setAlwaysOnTop(true, 'floating')` en `browser:open`; quitarlo en deactivate/close. El chrome queda fuera de los bounds del guest (arriba), así que sigue clickeable. Zoom % en el chrome vía DOM imperativo (no `useState`) para no re-renderizar Excalidraw.

### Web search: PNG con franja blanca arriba

#### Descripción más detallada

`Page.captureScreenshot` con `clip` desde `getContentSize()` + `setZoomFactor` dejaba a veces una banda blanca arriba (DIP ≠ viewport CSS). El debugger CDP no aportaba vs `webContents.capturePage()`.

#### Corrección

Usar solo `wc.capturePage().toPNG()` — captura exactamente lo visible en el guest.

### Upload PDF: thumbnails rotos tras defer del worker

#### Descripción más detallada

Cold-start movió `GlobalWorkerOptions.workerSrc` de `main.tsx` a `PdfDocument.ts` (lazy con el canvas). `getPdfMetadata` (`lib/pdf.ts`) sigue usando `getDocument` al subir un PDF desde categoría/home **sin** haber cargado `PdfDocument` → workerSrc vacío → thumbnail vacío/roto.

#### Corrección

Configurar el worker en `pdfjs.ts` (punto único de `getDocument`). CSS del viewer puede quedarse en `PdfDocument`.

### Host arrows: borrar note/search capture deja flecha; undo no la revive

#### Descripción más detallada

Flechas `pdfNoteArrow` / `pdfSearchArrow` son host-managed (`locked`, sin bindings). Soft-delete via `sync*` + `updateScene(NEVER)` al borrar el embed. Tres tropiezos:

1. Soft-delete sí, pero **sin revive** cuando el target vuelve (Ctrl+Z) — el comentario ponytail lo dejó como “recreate via Buscar/Add note”.
2. Sync leía `getSceneElements()` → **excluye** `isDeleted`. Tras soft-delete la flecha no está en la lista → el revive nunca la ve; al `updateScene` con solo live se puede perder del store. Persist también usa live-only → sesión sin flecha aunque el embed vuelva.
3. E2E undo: tras Ctrl+Z la escena ≈ seed → `markUnsaved` limpia dirty (`gate.clear`). `leaveToHome` no flusha (`if (!dirtyRef.current) return`). El assert en sesión leía el seed viejo o el delete autosaved, no el revive.

Early-return de `activeEmbeddable === 'hover'` también saltaba el sync de flechas en el onChange del undo.

#### Corrección

- `syncPdfNoteArrows` / `syncPdfSearchArrows`: soft-delete si el target no vive; **revive** (`isDeleted: false` + geom) si vuelve. Preferir `newElementWith` para el flip de `isDeleted` (versionNonce).
- En `handleExcalidrawChange`: sync de flechas con `getSceneElementsIncludingDeleted()` **antes** del early-return de hover.
- E2E undo: tras delete → `expectUnsaved` → `expectSaved` (flush del borrado) → Ctrl+Z → `expectUnsaved` → leave → assert flecha viva.

### Web search: panel de estilos Excalidraw activa capture detrás

#### Descripción más detallada

El activate del guest es host-owned: `pointerdown`/`pointerup` en capture sobre `excalidrawHostRef` convierte `clientX/Y` → scene y hace hit-test del capture. El panel izquierdo de stroke/fill (`.layer-ui__wrapper`) no estaba excluido; un click en un estilo cuya proyección en escena cae sobre un webembed abría el browse sin querer.

#### Corrección

Ignorar targets en `[data-browser-chrome], .layer-ui__wrapper, .context-menu, .excalidraw-toast-container` en activate/deactivate. Mismo filtro en el `pointermove` que frena hover de embeds, para no robar hover del UI.

### `annotationList` no debe importar `pdfSearchCapture`

#### Descripción más detallada

Al listar search captures en Annotations, el approach natural fue `import { isPdfSearchCapture, … } from './pdfSearchCapture'`. Ese módulo importa Excalidraw runtime → rompe `bun:test` de `annotationList` (mismo motivo que el check inline histórico en `countCanvasStats`).

#### Corrección

Flags/getters locales inline (`customData?.pdfSearchCapture`, `fileId`, `query`) dentro de `annotationList.ts`. No importar `pdfSearchCapture` desde lógica que corre en unit tests sin Excalidraw.

### Long PDF arrow crash: no era ±1e6 / elbow, era migrate mid-draw

#### Descripción más detallada

Crash `Maximum update depth` al dibujar flecha manual con una nota presente (a veces en PDFs largos con logs `y≈3e6`). El approach inicial apuntó al clamp elbow / techo ±1e6 de Excalidraw. El usuario corrigió: también con flechas rectas, y **solo con NoteEmbed**.

Causa real: notas son embeddables bindable → mid-draw `endBinding` a la nota → `syncPdfNoteArrows` migraba eso a `pdfNoteArrow` + `updateScene` pelea con el draw en curso.

#### Corrección

`syncPdfNoteArrows(..., { migrateBoundArrows })`. Live `onChange` pasa `false`; migrate legacy solo en open/restore (default `true`). Unit test: `migrateBoundArrows:false` deja la flecha con endBinding intacta. Migrate legacy solo si la nota tiene `sourceHighlightId` (Place note + flecha libre no se convierte en host arrow).

#### Approach erróneo (no repetir)

`detachBindingsToPdfNotes` / `setPdfNotesLocked` mid-draw y rebase `sceneOrigin` para coords ≪1e6. El usuario rechazó ambos: quitan binding o son un parche de coords. El loop se corta **sin** tocar features: en `handleExcalidrawChange`, si `newElement`/`multiElement` ≠ null → no `updateScene` del host (solo `markUnsaved`). Bindings a notes intactos.

### Migrate on open: flecha libre se fusionaba con Add-note arrow

#### Descripción más detallada

Add note crea `pdfNoteArrow` host. El usuario dibuja otra flecha libre con `endBinding` a esa misma note. Al reabrir, `migrateBoundArrows` (default en open) veía `endBinding` + `sourceHighlightId` y reescribía la flecha libre como un **segundo** `pdfNoteArrow` con geometría highlight→note → solape / “merge” con el conector automático.

#### Corrección

En el branch migrate: si ya existe un `pdfNoteArrow` vivo para ese `noteId`, no migrar. Legacy (solo endBinding, sin host arrow) sigue migrando.

### macOS: `Asset protocol error` / `net::ERR_FAILED` tras fix Windows

#### Descripción más detallada

Para Windows se cambió el handler `asset:` a `request.url.replace(/^asset:/, 'file:')`. En macOS las thumbnails/PDFs en `categories.json` siguen el formato legacy de Electron: `asset://localhost/%2FUsers%2F…`. El replace produce `file://localhost/%2FUsers%2F…` → `ERR_FAILED`.

#### Corrección

`replace` solo en `win32`. En darwin/linux: `file://${decodeURIComponent(new URL(request.url).pathname)}` (soporta `localhost/%2F…` y `asset:///Users/…`).

### E2E: `Current page` nunca aparece / browser closed tras `useHashLocation`

#### Descripción más detallada

Tras el switch a `useHashLocation` en `file:` (packaged / e2e vía `loadFile`), `navigatePdf` seguía con `history.pushState('/category/…')` + `popstate`. Eso reescribe a `file:///category/…` y el router hash no cambia → la home sigue visible; el wait de `Current page` falla (a veces como "browser has been closed" cuando el test timeout cierra Electron).

#### Corrección

Helpers e2e: si `location.protocol === 'file:'` → `location.hash = path`; si no, pushState+popstate. Centralizar en `navigateApp` / `navigatePdf` / `navigateCategory`.

### Leave Home con hash router: flush escribe `elements: []`

#### Descripción más detallada

El click interceptor en `PdfCanvasApp` hacía early-return si `href.startsWith('#')` (pensado para anclas). Con `useHashLocation`, los `<Link>` son `#/…` → no flush antes de navegar. El cleanup de unmount a veces escribe escena vacía (Excalidraw ya teardown) → wipe de highlights/notes. Tests de "Remove" pasaban en falso porque empty también cumple "highlight gone".

#### Corrección

Tratar `#/…` como navegación in-app (flush + `setLocation(href.slice(1))`); solo ignorar `#frag` sin `/`.

### Web search: reintento WebContentsView (hide-not-detach)

#### Descripción más detallada

El guest pasó de `BrowserWindow` overlay (`alwaysOnTop`, sin `parent:`) a `WebContentsView` hijo del host `contentView`. Motivo: el overlay flotaba sobre otras apps y se salía de la ventana. El fallo histórico con WCV era `ERR_FAILED` por `removeChildView` / deactivate mid-`loadURL` (y race con `activeEmbeddable`).

#### Corrección

- Session ownership sigue en `activeBrowserCaptureIdRef` (no `activeEmbeddable`).
- `browser:deactivate`: `capturePage` + cookie flush + `setVisible(false)` — **nunca** `removeChildView` mid-load.
- `browser:close` / quit: ahí sí detach + `webContents.close()`.
- Bounds en coords del contentView (sin sumar screen origin). Sin `alwaysOnTop`.

### Always-on text select: Cmd+Z “solo con canvas” y A “robado”

#### Descripción más detallada

Tras pass-through de la text layer, Cmd/Ctrl+Z parecía interceptado por el host. No lo estaba: Excalidraw por defecto pone `onKeyDown` solo en el nodo React (focus dentro de `.excalidraw`). Clicks en toolbar / text leave focus fuera → undo muerto hasta click en el canvas. Cmd+A seleccionaba todo el PDF text porque el browser default ganaba sobre Excalidraw select-all.

Cross-page: `range.getClientRects()` devolvía cajas ~altura de página (`.endOfContent` / multi-page).

#### Corrección

- `handleKeyboardGlobally` en `<Excalidraw>` (document keydown).
- Cmd/Ctrl+A: `preventDefault` + `removeAllRanges` (sin `stopPropagation`) salvo writable/note.
- Rects: `clipRangeToNode` por `.textLayer span` + `dropOversizedClientRects`.
- Toolbar: hide en `selectionchange` collapsed, pointerdown fuera (`removeAllRanges` si pending), Escape; Copiar también en pending.
- E2E: rebuild (`electron-vite build`) antes de `playwright` directo — `test:e2e` ya buildea.

### Text caret snap: only started on spans → margin→margin no-op

#### Descripción más detallada

Heurística de snap (whitespace → inicio/fin de línea) solo armaba `snapDrag` si el `pointerdown` caía en un `.textLayer span`. Arrastrar **margen → margen** (fuera del glifo pero sobre la página) nunca activaba el host: `.endOfContent` / hit en `.textLayer` tienen `user-select: none` o no inician Selection nativa, y el foco nunca se snapeaba. El síntoma: “selecciono en diagonal fuera del texto y no entra nada intermedio”.

#### Corrección

- `pointerdown` en cualquier hit de `.textLayer` registrado (whitespace o span).
- Si whitespace: anclar con `resolveSnapCaret`, seed del Range, `fromWhitespace` → el host maneja todo el `pointermove`.
- Si span: ancla nativa (`caretRangeFromPoint`); snap solo mientras el move está en whitespace.

### Text caret snap: flicker cross-page por snappear contra la página de inicio

#### Descripción más detallada

Con drag margen→margen OK in-page. Al cruzar a la página siguiente, el `pointermove` seguía llamando `resolveSnapCaret(startLayer, x, y)` con coordenadas de la página 2. El focus saltaba a líneas de la página 1 y peleaba con la Selection cross-page nativa → flickering en whitespace.

#### Corrección

Resolver el focus en `layerFromTarget(hit)` (text layer bajo el cursor). Entre páginas (sin layer) no reescribir Selection. `focusLayer.classList.add('selecting')` al snappear.

### Search capture image: outside-click no cierra browse

#### Descripción más detallada

E2E `center-click re-activates browse on native image capture` fallaba: chrome seguía `display:flex` tras click fuera. Causa: browse de `image` no setea `activeEmbeddable` (solo el hook `activeBrowserCaptureIdRef`). Al mover el mouse a vacío, `.pdf-text-pass` pone `.excalidraw-host { pointer-events: none }` → el listener de deactivate (en el host) no ve el pointerdown (cae en `.textLayer`). Los embeddables aguantaban porque Excalidraw deja `activeEmbeddable.active` y eso ya desactiva pass-through.

#### Corrección

En el gate de pass-through, tratar `isBrowsing()` como `activeEmbeddable.active` → `setPdfTextPass(false)`.

### Always-on text pass: no se puede clickear / seleccionar en Excalidraw

#### Descripción más detallada

Tras pass-through siempre-on (selection tool + miss → `.pdf-text-pass` → host `pointer-events: none`), el canvas de Excalidraw queda sordo en casi toda la página PDF. Dos fallos:

1. **Race en pointerdown:** el browser elige el target *antes* de que el handler en capture apague pass. Un click sobre una shape/highlight/nota con pass aún on cae en `.textLayer`; apagar PE en el mismo evento no retargetea → “no puedo clickear elementos”.
2. **Gate por `event.target.closest('.textLayer')`:** con pass off el target es el canvas de Excalidraw, nunca el text layer → pass no se arma (o al revés: armar pass en cualquier miss incluyendo gutters mata el marquee).

#### Corrección

- Armar pass solo si el punto está en el **bbox** de un `.textLayer` (geométrico, no `event.target`).
- Pad ~12px en hover para apagar PE antes del borde del elemento.
- Si `pointerdown` llega con pass on + target en `.textLayer` + hit **sin pad** en escena: `preventDefault` + re-dispatch al canvas interactivo.
- E2E: disparar `pointerdown` en coords de la shape *sin* `mouse.move` previo (el move limpiaría pass y no ejercita el race).

### Flechas: handles de edición muertos sobre texto PDF

#### Descripción más detallada

Con selection tool + miss AABB → `.pdf-text-pass`, el canvas interactivo queda `pointer-events: none`. Las flechas son hairline (`height≈0` / `width≈0`); anclas, dot de bend, tip UI y bordes de resize viven fuera del AABB (+ pad que además se encoge con zoom). El forward de race solo cubre hit AABB estricto (pad=0), no el chrome de edición.

#### Corrección

En el gate de pass-through: si hay `selectedElementIds` o `editingLinearElement`, forzar pass off (Excalidraw posee el pointer hasta deseleccionar). E2E: flecha horizontal unlocked seleccionada + hover sobre texto → pass sigue off.

### Search capture: resize/move desactiva browse + aspect lock

#### Descripción más detallada

Con el guest activo, un `pointerdown` fuera del AABB del capture llamaba `deactivateSearchBrowser` → `capturePage` → promote a `image`. Los handles de resize/move de Excalidraw viven justo fuera del AABB (el `WebContentsView` solo cubre el rect), así que al redimensionar se perdía el browse y el resize quedaba con aspect lock de imagen.

Además, `demoteSearchCaptureToEmbeddable` hacía `scale: undefined`. Excalidraw `resizeSingleElement` chequea `"scale" in el` (true) y lee `origElement.scale[0]` → TypeError en cada pointermove → drag “tildado”.

Ocultar el WCV en hover/pointerdown para “proteger” el drag rompía la UX (no se ve el contenido al resizear) y `setVisible` mid-gesto puede abortar el pointer capture del host.

#### Corrección

- Hit de “inside” mientras browsing: `isActiveSearchCapturePointerHit` con pad ~20 CSS px / zoom.
- Al activar un capture `image`, demote a embeddable; **delete** `scale`/`status` (no `undefined`); deactivate vuelve a promover.
- Guest **sigue visible** y `setBounds` live-follow durante resize; inset ~12px para que los handles no caigan bajo el WCV.


