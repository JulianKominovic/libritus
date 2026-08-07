# 04 — i18n: fuente única de claves (satisfies derivado)

- **Estado:** EN PLANIFICACIÓN (bajo riesgo, bajo valor — opcional)
- **Fuente:** `ANALYSIS_REFACTOR.md` sección D.
- **Ownership (solo estos):**
  - `src/renderer/src/i18n/translations-keys.ts`
  - `src/renderer/src/i18n/en.ts`
  - **No** tocar `settings.tsx` (lo reclama `03`), **no** tocar `lang-context.tsx`
    (solo consume el tipo).
- **Gate:** ninguno.

## Situación actual

- `translations-keys.ts` define `export type TranslationsKeys` (union, 20 claves).
- `en.ts` reimplementa `Record<TranslationsKeys, string>` a mano. TS valida el Record contra el
  union (no es bug), pero agregar una clave toca 2 archivos y el orden puede diferir
  (`info` al final en `en.ts`).

## Pasos

1. En `en.ts`, definir el objeto como **fuente única**:
   ```ts
   export const en = { /* 20 entradas, orden lógico */ } as const
   ```
2. En `translations-keys.ts`, derivar y **re-exportar el mismo tipo** para no romper importers:
   ```ts
   import { en } from './en'
   export type TranslationsKeys = keyof typeof en
   ```
   - Sin import circular: `en.ts` deja de importar desde `translations-keys.ts`.
   - `lang-context.tsx` y `settings.tsx` siguen importando el tipo desde `translations-keys`
     → no requieren cambios (verificación: `rg "translations-keys" src/renderer/src`).
3. Si `t()` en `lang-context` usa `en[key]`, confirmar que el fallback sigue tipado
   (el objeto `as const` devuelve el literal correcto por clave).
4. Añadir una clave nueva en un único lugar para demostrar el flujo (solo si ya existe la necesidad;
   si no, dejar el refactor sin cambio de contenido).

## Verificación
- `npm run typecheck`, `bun test`.
- Smoke: home/settings muestran los mismos textos.

## Riesgos / no hacer
- No crear un sistema de i18n general (context/plurale/rtl). Solo eliminar la doble fuente.
- No tocar archivos de otros planes.

## Definition of done
- Una única lista de claves; `TranslationsKeys` derivada; cero cambios en consumidores;
  typecheck verde.
