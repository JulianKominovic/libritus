# 05 — Base compartida PagePool / ThumbPool

- **Estado:** EN PLANIFICACIÓN (evaluar primero; no aplicar a ciegas)
- **Fuente:** `ANALYSIS_REFACTOR.md` sección C.4 + AGENTS.md (pool pattern, lección de memoria #8).
- **Ownership (solo estos):**
  - `src/renderer/src/lib/pdf-canvas/PagePool.ts`
  - `src/renderer/src/lib/pdf-canvas/ThumbPool.ts`
  - `src/renderer/src/lib/pdf-canvas/PagePool.test.ts`, `ThumbPool.test.ts`
  - + nuevos archivos compartidos (p.ej. `pool-core.ts`) si el refactor lo amerita.
- **Gate:** ninguno (pero ver decisión abajo).

## Situación actual

- `PagePool` (L48): `slots`, `jobs`, `pending` (cola `MAX_CONCURRENT` = 2), `inFlight`, `runToken`,
  `wanted`, `clock`/LRU, `capacity = poolSize` (hard cap), `subscribe/notify`, `destroyed`.
- `ThumbPool` (L32): `slots`, `jobs`, `generation`, `clock`/LRU, `capacity = poolSize`,
  `subscribe/notify`, `destroyed`. (Sin cola host: thumbnails no tienen la misma semántica de cancel.)
- Duplicado real: slots Map, LRU `clock`/`lastUsed`, `subscribe/notify`, flag `destroyed`,
  eviction LRU, `capacity` fija.
- Diferencia real: PagePool tiene cola/cancel avanzada (pending+inFlight+runToken) que ThumbPool no.

## Decisión requerida (no asumir)

Con **2 consumidores** (AGENTS.md lo trata como convención, no como deuda), evaluar si la
abstracción paga: el core compartido debe quedar **más pequeño que la duplicación que reemplaza**.
Si el resultado es un base class con 5 métodos triviales, **descartar y dejar el patrón**
(documentarlo). Criterio de corte: ≥ ~60 líneas de duplicación neta extraída con tests intactos.

## Pasos (si aplica)

1. Medir: extraer solo lo verdaderamente común a una base `PoolCore<T extends PoolSlot>`:
   `slots`, `clock`/LRU (`touch`/`evictLru`), `capacity` (hard cap), `subscribe/notify`,
   `destroyed`, `getSlot`/`getSlots`. **No** mover: cola `MAX_CONCURRENT`, `pending`/`inFlight`/
   `runToken` (PagePool), `generation` (ThumbPool), `capPreferCenter` (queda en PagePool).
2. PagePool y ThumbPool extienden `PoolCore`, conservando sus tipos (`PageSlot`/`ThumbSlot`) y
   su lógica de render/jobs.
3. **Preservar el hard cap**: `capacity` siempre `poolSize`; nunca crecer con `needed`
   (lección #8: “pool size is a hard budget now”). Añadir un test que lo pinne en ambos pools.
4. Refactor en 1 PR, diffs pequeños; no tocar `PdfLayer`/`PdfSidebar` (consumidores) salvo
   que cambien los exports públicos (`PagePool`/`ThumbPool` siguen exportando lo mismo).

## Verificación
- `bun test` — `PagePool.test.ts` (incluye gen abort / cancel) y `ThumbPool.test.ts` verdes.
- `npm run typecheck`.
- E2E: `pdf-canvas.spec.ts`, `outline-thumbs.spec.ts`, `session.spec.ts`.
- Manual: abrir PDF grande, pan/zoom rápido (pool no thrash), sidebar de thumbs fluido.

## Riesgos / no hacer
- **No** unificar el pool con lógica de render ni la cola host (son dominios distintos).
- **No** cambiar la constante `DEFAULT_POOL_SIZE` (12 / 16) ni el comportamiento de eviction.
- **No** sobre-abstraer “para el futuro”: solo 2 consumidores.

## Definition of done
- Core compartido extraído (o decisión documentada de NO abstraer con la medición).
- Hard cap preservado y testeado; todos los tests/checks verdes.
