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
