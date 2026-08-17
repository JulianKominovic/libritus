# PERF-07: writeback del catálogo y suscripciones globales

**Prioridad:** P1  
**Owner sugerido:** Zustand / filesystem  
**Estado:** pendiente de profiling e implementación

## Problema

El progreso de lectura y las estadísticas de canvas se escriben actualizando el array completo de categorías. `setCategories()` serializa todo `categories.json` y notifica a todos los consumidores del array.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:186-205` llama writeback al guardar.
- `src/renderer/src/lib/pdf-canvas/catalogWriteback.ts:4-35` actualiza progreso y stats.
- `src/renderer/src/stores/categories.ts:153-156` serializa y publica todo el catálogo.
- `src/renderer/src/stores/categories.ts:222-234` reconstruye todas las categorías para `updatePdf`.
- `src/renderer/src/templates/sidebar.tsx:50-84,378-381` se suscribe a `categories` completo.
- `src/renderer/src/templates/navbar.tsx:33-121` también deriva segmentos desde el array completo.

## Impacto esperado

- Escrituras completas de JSON por cambios pequeños.
- Re-renders de shell durante navegación/autosave.
- Reconstrucción de `treeData`, breadcrumbs y mapas derivados.
- Posibles writes concurrentes si se disparan varios updates antes de completar el anterior.

## Alcance

- Reducir el coste de actualización de progreso/stats.
- Mantener persistencia del catálogo y actualización de cards.
- Mantener consistencia entre memoria y disco.

## Dirección recomendada

1. Medir cuántas veces se llama `updatePdf` durante una sesión.
2. Introducir una cola o debounce para writeback de progreso, sin retrasar el session autosave.
3. Separar estado de progreso transitorio del catálogo si el producto lo permite.
4. Usar selectores más específicos para shell cuando sea posible.
5. Serializar writes de catálogo para evitar carreras.
6. Mantener writeback inmediato para acciones explícitas que necesiten durabilidad.

## Criterios de aceptación

- El progreso final se conserva después de cerrar y reabrir.
- Las estadísticas de cards siguen sincronizadas.
- Navegar rápidamente entre páginas no genera una escritura por evento de cámara.
- No se pierde la última actualización por una carrera de filesystem.
- Navbar y Sidebar no rerenderizan por cambios irrelevantes cuando puedan evitarlo.

## Medición

- Número de `setCategories`, `writeFile`, `JSON.stringify` y renders de shell.
- Duración de la escritura con catálogos pequeños y grandes.
- Navegación rápida, autosave y salida de ruta simultáneos.

## Conflictos

Comparte `categories.ts` con PERF-11 y `templates/sidebar.tsx` con PERF-09/13. Coordinar API de store antes de editar.
