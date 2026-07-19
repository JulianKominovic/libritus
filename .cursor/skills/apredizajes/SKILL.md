---
name: apredizajes
description: En este archivo se encuentran los apredizajes recaudados de los agentes. Aca escribimos errores que se han cometido y cómo se corrigieron o approaches que tomó el modelo de lenguaje pero no fueron los adecuados. Este archivo es mantenido y actualizado por el agente.
---

# Aprendizajes

En este archivo se encuentran los apredizajes recaudados de los agentes.

Aca escribimos solamente los errores cometidos o approaches erróneos que tomó el modelo de lenguaje en contra de lo que pidió el usuario.

No es un archivo de aprendizajes para usar siempre, sino que se usa para evitar tropezar dos veces con la misma piedra.

Este archivo es mantenido y actualizado por el agente.

## Errores

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
