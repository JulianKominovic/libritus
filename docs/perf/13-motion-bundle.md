# PERF-13: bundle de Motion

**Prioridad:** P2  
**Owner sugerido:** build/frontend shell  
**Estado:** pendiente de análisis de bundle

## Problema

El proyecto importa `motion` completo en varios componentes. React Doctor estima coste de bundle adicional y recomienda `LazyMotion`/`m`.

## Evidencia

- `src/renderer/src/App.tsx:1` importa `motion`.
- `src/renderer/src/pages/home.tsx:1,11` usa Motion en contenido inicial.
- `src/renderer/src/pages/settings.tsx:22` importa Motion.
- `src/renderer/src/templates/sidebar.tsx:33` importa Motion en el shell persistente.
- `src/renderer/src/components/ui/context-menu-animated.tsx:4` importa Motion.
- `package.json:16-23` contiene scripts de build pero no una medición de bundle incorporada.

## Impacto esperado

- Bundle inicial mayor, principalmente por `App`, Sidebar y Home.
- Tiempo de parse/compile mayor al iniciar Electron.
- Impacto menor en rutas lazy si el chunk ya está separado.

## Alcance

- Medir bundle antes/después.
- Cambiar imports solo donde la API de Motion usada sea compatible.

## Dirección recomendada

1. Generar baseline del bundle de producción.
2. Identificar qué componentes usan solo animaciones DOM básicas.
3. Evaluar `LazyMotion` con `domAnimation` y `m`.
4. Mantener `motion` completo donde una feature concreta lo requiera.
5. Repetir startup benchmark después del cambio.

## Criterios de aceptación

- El build mantiene animaciones de shell, cards y context menus.
- El bundle inicial se reduce o se demuestra que el cambio no compensa.
- No se añaden errores de hydration/flicker ni cambios de timing visibles.
- `startup.spec.ts` sigue pasando.

## Medición

- Tamaño de chunks gzip/brotli.
- Tiempo de `first-contentful-paint` y Home visible.
- Comparación con React Scan deshabilitado.

## Conflictos

Comparte `App.tsx` y `templates/sidebar.tsx` con PERF-09/07. Preferir un commit aislado de build/imports.
