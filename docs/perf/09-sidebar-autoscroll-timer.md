# PERF-09: timer de auto-scroll del sidebar

**Prioridad:** P2  
**Owner sugerido:** shell/sidebar DnD  
**Estado:** candidato a fix aislado

## Problema

El auto-scroll durante drag usa un intervalo guardado en una variable local del render. El cleanup del efecto no limpia un intervalo activo.

## Evidencia

- `src/renderer/src/templates/sidebar.tsx:102-105` declara `let timer` dentro del componente.
- `src/renderer/src/templates/sidebar.tsx:106-143` crea y reemplaza intervalos desde el callback del monitor.
- `src/renderer/src/templates/sidebar.tsx:144-151` solo desuscribe el monitor.
- React Doctor reportó `exhaustive-deps` en `sidebar.tsx:129` por la vida del timer.

## Impacto esperado

- Intervalos vivos después de desmontar Sidebar/TreeView.
- Lecturas de `containerRef.current` fuera del ciclo de vida esperado.
- Trabajo cada 10 ms durante una navegación o drag incompleto.

## Alcance

- Corregir ownership del intervalo.
- Mantener velocidad y dirección actuales de auto-scroll.
- Mantener suscripción DnD y drop behavior.

## Dirección recomendada

1. Cambiar `timer` a `useRef<ReturnType<typeof setInterval> | null>`.
2. Centralizar `clearAutoScroll()`.
3. Limpiar antes de iniciar otro intervalo.
4. Limpiar en el return del efecto.
5. Limpiar también en drag end/blur si el monitor lo permite.

## Criterios de aceptación

- No queda ningún intervalo tras desmontar `TreeView`.
- No se crean intervalos duplicados durante `subscribeToOffsetChange`.
- Drag hacia el borde sigue desplazando el contenedor.
- `sidebar-dnd.spec.ts` continúa pasando.

## Medición

- Instrumentar creación y cancelación de intervalos.
- Desmontar Sidebar durante drag y observar actividad posterior.

## Conflictos

Comparte `templates/sidebar.tsx` con PERF-07 y PERF-13. Es un fix local que debería implementarse antes de refactors del componente.
