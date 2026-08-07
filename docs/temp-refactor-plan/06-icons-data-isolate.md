# 06 — Aislar / generar `icons-data.ts`

- **Estado:** EN PLANIFICACIÓN (investigación primero; no-op aceptado)
- **Fuente:** `ANALYSIS_REFACTOR.md` sección C.5.
- **Ownership (solo estos):**
  - `src/renderer/src/components/ui/icons-data.ts` (13.504 líneas, `//@ts-nocheck`)
  - `src/renderer/src/components/ui/icon-picker.tsx` (único importador, L19 type / L69 `await import`)
  - + script de generación nuevo (p.ej. `scripts/generate-icons-data.mts`) si aplica.
- **Gate:** ninguno.

## Situación actual

- `icons-data.ts` está **vivo** (dynamic import desde `icon-picker.tsx:69`), no es dead code.
- 13.504 líneas con `//@ts-nocheck`, import dinámico ya existente → probablemente **no** infla el
  bundle inicial (code-splitting por el `await import`).

## Pasos

1. **Medir antes de tocar:** con `bun run dev` o build, confirmar qué chunk contiene
   `icons-data` (¿chunk separado? ¿peso?). Si ya es chunk lazy y no entra al bundle inicial,
   la mejora real es mínima → considerar no-op y solo documentar.
2. Determinar el origen de los datos:
   - Si los icons vienen de un catálogo (p.ej. lucide) → generar `icons-data.ts` en build con un
     script (`scripts/generate-icons-data.mts`) que lea una lista corta (nombres de icon) y
     emita el módulo con `// @ts-nocheck` y la estructura actual. Quita el archivo de 13.5k de
     manos y permite re-generar al actualizar la lista.
   - Si los icons son manuales/únicos → mover el archivo fuera de `components/ui` a
     `lib/icons/` (o `assets/`) para aclarar que no es un primitivo shadcn, y añadirlo a la
     allowlist de knip si el análisis lo marca.
3. Si se genera: `prebuild` en `package.json` que corra el script antes de `electron-vite build`
   (y commit del archivo generado o generación on-the-fly — preferir commit para builds
   deterministas, regenerado en el PR).
4. Mantener la API exportada idéntica (el `iconsData` que importa `icon-picker` por type y valor).

## Verificación
- `npm run typecheck`, `bun test`, `npm run build`.
- E2E o smoke del `IconPicker` (donde se use, p.ej. picker de icon en categorías/UI).
- Si no-op: reportar medición (chunk size antes/después) y cerrar con decisión.

## Riesgos / no hacer
- **No** eliminar el dynamic import (ahí está el code-split).
- **No** convertir a import estático “por claridad” (reinfla el bundle).
- No tocar la semántica de búsqueda/filtrado del picker.

## Definition of done
- `icons-data` aislado en un módulo claro **o** generado por script, sin cambio de API ni de
  comportamiento del picker; medición de bundle adjunta; checks verdes. (No-op es un resultado válido.)
