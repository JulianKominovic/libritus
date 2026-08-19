# PERF-14: identidad del contexto de idioma

**Prioridad:** P2  
**Owner sugerido:** React shell/i18n  
**Estado:** candidato a fix pequeño

## Problema

`LangProvider` crea un objeto `value` nuevo en cada render. Todos los consumidores del contexto pueden rerenderizar aunque `lang`, `setLang` y `t` no hayan cambiado.

## Evidencia

- `src/renderer/src/i18n/lang-context.tsx:27-30` obtiene `lang` y setter desde Zustand.
- `src/renderer/src/i18n/lang-context.tsx:36-47` crea `t` estable por `lang`.
- `src/renderer/src/i18n/lang-context.tsx:49` crea `value={{ lang, setLang, t }}` inline.
- React Doctor lo reporta como `jsx-no-constructed-context-values`.

## Impacto esperado

- Re-renders de todos los consumidores si el provider rerenderiza por una razón externa.
- Impacto probablemente bajo porque la mayoría de cambios del provider están ligados a `lang`, pero la identidad inestable no aporta valor.

## Alcance

- Estabilizar el objeto del provider.
- Mantener la API `useLang()` y actualización de locale del proceso principal.

## Dirección recomendada

1. Memoizar el `value` con `lang`, `setLang` y `t` como dependencias.
2. Confirmar que `setLang` de Zustand sea estable.
3. Añadir una prueba o profiling que demuestre que consumidores no rerenderizan por un render ajeno del provider.

## Criterios de aceptación

- Cambiar idioma actualiza todos los textos.
- Cambiar una preferencia no relacionada no fuerza consumidores de idioma sin necesidad.
- El IPC `app:set-locale` sigue ejecutándose cuando cambia `lang`.
- `i18n.test.ts` y navegación básica pasan.

## Medición

- React Profiler con Navbar, Sidebar y PdfCanvas montados.
- Contar commits al cambiar settings no relacionados con idioma.

## Conflictos

No debería compartir archivos con otros paquetes salvo cambios de medición.
