# 03 — Unificar los dos context menus

- **Estado:** EN PLANIFICACIÓN
- **Fuente:** `ANALYSIS_REFACTOR.md` sección C.2.
- **Ownership (solo estos):**
  - `src/renderer/src/components/ui/context-menu.tsx` (Radix, 270 líneas, `@ts-nocheck`) → **delete**
  - `src/renderer/src/components/ui/context-menu-animated.tsx` (floating-ui + motion, 505 líneas) → **extender si falta API**
  - `src/renderer/src/pages/settings.tsx` → cambiar import
  - `src/renderer/src/organisms/pdf/pdf-card-context-menu-content.tsx` → cambiar import
  - `package.json` → quitar `@radix-ui/react-context-menu` si queda sin uso
- **Gate:** ninguno.

## Situación actual

- **Animado** (a conservar): usado en `home.tsx` y `category.tsx` (`ContextMenu`, `ContextMenuTrigger`).
  Ya exporta la API completa: `ContextMenu, ContextMenuTrigger, ContextMenuContent, ContextMenuGroup,
  ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut` (export block L496+).
- **Radix** (a eliminar): usado solo por `settings.tsx` (`ContextMenu, ContextMenuTrigger,
  ContextMenuContent, ContextMenuItem`) y `pdf-card-context-menu-content.tsx` (`ContextMenuContent,
  ContextMenuItem, ContextMenuSeparator`). `pdf-card-context-menu-content` lo consumen `home.tsx`,
  `category.tsx` y `templates/sidebar.tsx` — un solo cambio de import cubre los tres.
- `context-menu.tsx` **está vivo** hoy → el plan `01` no lo toca.

## Pasos

1. Verificar compatibilidad de API entre el Radix y el animado para los props usados:
   - `settings.tsx` usa `<ContextMenuTrigger asChild>` — el animado renderiza
     `ContextMenuPrimitive.Trigger asChild` internamente (L324), acepta `children`.
   - `pdf-card-context-menu-content.tsx` usa `onSelect`/`className` en `ContextMenuItem` y
     `ContextMenuSeparator` — confirmar soporte; si falta algo, **extender el animado**
     (no mantener dos).
   - Comparar `contentProps`/estado abierto (el animado usa floating-ui: verificar posicionamiento
     y cierre en click fuera — cubre los casos de home/category).
2. Cambiar imports:
   - `settings.tsx` L2–7 → `from '@renderer/components/ui/context-menu-animated'`.
   - `pdf-card-context-menu-content.tsx` L1–5 → idem.
3. Adaptar props si el animado difiere (p.ej. nombres de handler, `sideOffset`). Mantener el
   **mismo estilo visual** que hoy usan settings/cards (si el animado difiere en padding/radius,
   alinear con `className` para que no cambie la UI de forma visible).
4. Borrar `context-menu.tsx`.
5. Quitar `@radix-ui/react-context-menu` de `package.json` solo si `rg` confirma cero usos restantes.
6. Verificar que `block-menu-kit.tsx` / `callout-node.tsx` / `block-context-menu.tsx` (que importan
   `context-menu`) son muertos — si siguen existiendo, `01` los borra después; no arreglarlos acá.

## Verificación

- `npm run typecheck`, `bun test`.
- `npm run build`.
- E2E: `home.spec.ts` (context menu sobre PDF card — menú animado ya cubierto),
  `annotation-panel.spec.ts` o smoke manual en settings (context menu sobre cada row).
- Smoke: click derecho en card PDF y en fila de settings → menú aparece con los mismos items.

## Riesgos / no hacer
- No tocar `templates/sidebar.tsx` directamente (solo consume `pdf-card-context-menu-content`).
- No eliminar el Radix hasta que ambos imports estén migrados y los checks pasen.
- No unificar por la fuerza si el animado rompe submenu/positioning en cards — en ese caso
  documentar y devolver; no mantener ambos silos a medias.

## Definition of done
- Un solo context menu (`context-menu-animated.tsx`); `context-menu.tsx` y la dep Radix eliminadas;
  UI de settings/cards sin regresión visual; checks verdes.
