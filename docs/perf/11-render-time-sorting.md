# PERF-11: ordenamiento durante render

**Prioridad:** P2  
**Owner sugerido:** library/catalog UI  
**Estado:** candidato a fix aislado

## Problema

La página de categoría ordena `category.pdfs` durante render y muta el array del store. Home aplana y ordena todas las categorías cada vez que renderiza.

## Evidencia

- `src/renderer/src/pages/category.tsx:213-217` ejecuta `category.pdfs.sort(...)` dentro del JSX.
- `src/renderer/src/pages/home.tsx:102-110` obtiene todo `categories` y llama `recentPdfs`.
- `src/renderer/src/lib/recentPdfs.ts:6-10` hace `flatMap`, `sort` y `slice` en cada llamada.
- `src/renderer/src/stores/categories.ts:153-156` publica arrays compartidos desde Zustand.

## Impacto esperado

- O(P log P) repetido en renders de categoría/Home.
- Mutación accidental de datos del store durante render.
- Trabajo adicional cuando el catálogo cambia por progreso o estadísticas.

## Alcance

- Hacer las derivaciones no mutantes.
- Reducir recomputación cuando categorías no cambiaron.

## Dirección recomendada

1. Usar `toSorted()` si el target lo soporta, o `[...category.pdfs].sort(...)`.
2. Memoizar la lista derivada con una dependencia de identidad estable.
3. Evaluar selector específico para la categoría actual en vez de suscribirse a todo el catálogo.
4. Para Home, mantener una derivación incremental solo si el catálogo real lo justifica.

## Criterios de aceptación

- El array del store no cambia durante render.
- Orden de cards y recientes permanece idéntico.
- Cambios de progreso no rompen inputs no controlados de nombre.
- Tests Home/Category y drag-and-drop siguen pasando.

## Medición

- Número de PDFs/categorías y duración de la derivación.
- Renders de Home y Category después de un update de progreso de otro PDF.

## Conflictos

Comparte `categories.ts` y suscripciones con PERF-07. No cambiar el shape del store sin coordinar ambos paquetes.
