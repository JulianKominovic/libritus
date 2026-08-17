# PERF-01: firma de persistencia en hot paths

**Prioridad:** P0  
**Owner sugerido:** canvas/persistence  
**Estado:** pendiente de profiling e implementación

## Problema

El dirty gate recalcula una representación completa de la escena para eventos de cámara y para cambios de Plate. El coste depende del número y tamaño de elementos, no del cambio realizado.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/usePdfNavigation.ts:104-114` llama `markUnsaved()` en cada `onScrollChange`.
- `src/renderer/src/organisms/pdf-canvas/usePdfNotes.tsx:72-85` llama `markUnsaved()` después de cada cambio de Plate.
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:88-109` obtiene, filtra, normaliza y mapea toda la escena.
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:162-167` clona antes de calcular la firma.
- `src/renderer/src/lib/pdf-canvas/sessionPersist.ts:31-39` vuelve a serializar la escena.
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:222-255` solo evita la firma durante drag dirty.

## Impacto esperado

- Jank al hacer wheel/trackpad en escenas grandes.
- Pausas al escribir notas con muchos elementos o imágenes.
- Presión de CPU y garbage collector por arrays y strings temporales.
- La mejora debe ser visible en duración de `markUnsaved` y en commits de wheel/teclado.

## Alcance

- Rediseñar el dirty gate para que cámara, edición de texto y mutaciones de escena no tengan el mismo coste.
- Mantener la semántica de undo, clear dirty al volver a la última firma guardada y flush al salir.
- Mantener merge de `pendingPlateByNoteIdRef` en snapshots.

## Fuera de alcance

- Cambiar el formato de sesión.
- Eliminar normalización de notas, capturas o clips.
- Hacer persistencia por página sin una decisión de formato.

## Dirección recomendada

1. Separar un dirty hint barato de la firma persistible.
2. Mantener una versión/epoch de escena persistible y actualizarla solo cuando cambia contenido persistible.
3. Tratar cambios de cámara con una firma de cámara barata o con una política de persistencia específica.
4. Calcular canonicalización y serialización completa dentro del autosave/flush, no en cada evento.
5. Si se conserva una firma completa, cachear el resultado y no clonar dos veces.

`structuredClone()` puede ser una mejora secundaria, pero no resuelve el recorrido y `JSON.stringify` completo.

## Criterios de aceptación

- Escribir 100 caracteres en una nota no ejecuta 100 serializaciones completas de la escena.
- Un pan/zoom continuo no clona toda la escena por evento.
- Undo hasta la última sesión guardada sigue mostrando `Saved`.
- Autosave y flush conservan texto Plate pendiente, cámara y adjuntos.
- `bun test` cubre el nuevo dirty gate y los casos actuales de `sessionPersist`.

## Medición

- Escenas con 10, 100 y 1000 elementos.
- Duración de `markUnsaved`, `currentPersistSignature` y `persistSignature`.
- Escritura de nota, wheel, zoom y drag por separado.

## Conflictos

Comparte `PdfCanvasApp.tsx` con PERF-03/04 y `usePdfPersistence.ts` con PERF-12. Implementar después de acordar la API del dirty gate.
