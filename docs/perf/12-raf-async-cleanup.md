# PERF-12: cancelación de rAF y trabajo async al desmontar

**Prioridad:** P2  
**Owner sugerido:** lifecycle canvas  
**Estado:** pendiente de revisión

## Problema

Algunos `requestAnimationFrame` y continuaciones async tienen guardas de generación/API, pero no una cancelación explícita al desmontar. El trabajo puede ejecutarse un frame después de que la sesión haya sido destruida.

## Evidencia

- `src/renderer/src/organisms/pdf-canvas/usePdfHostScene.ts:45-79` programa rAF de sincronización de arrows y no registra cleanup propio.
- `src/renderer/src/organisms/pdf-canvas/usePdfPersistence.ts:153-160` programa dos rAF anidados para limpiar links.
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:221-225` puede continuar con `setTick()` después de `syncVisible()`.
- `src/renderer/src/organisms/pdf-canvas/PdfLayer.tsx:268-282` limpia la suscripción, pero no invalida explícitamente `syncGenRef` en el cleanup.
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx:656-679` usa rAF de retry durante restore y comprueba cancelación después.

## Impacto esperado

- Trabajo inútil después de navegar fuera del PDF.
- Retención breve de callbacks, API y sesión antigua.
- Riesgo de callbacks contra un Excalidraw API ya destruido.

## Alcance

- Cancelar rAF pendientes y marcar generaciones inválidas al desmontar.
- Mantener las guardas existentes para open race.

## Dirección recomendada

1. Añadir cleanup de `arrowSyncRafRef` en el hook host.
2. Añadir un token de vida para rAF de persistencia y cancelarlo si se desmonta.
3. Incrementar `syncGenRef` durante cleanup de `PdfLayer`.
4. Mantener `pool.destroy()` antes de destruir el documento.
5. Verificar que cancelación no interrumpa el flush final de una sesión dirty.

## Criterios de aceptación

- No se llama `updateScene()` después de desmontar el canvas.
- No aparecen errores de documento destruido durante navegación rápida.
- Open race y quit flush siguen funcionando.
- Tests `open-race.spec.ts`, `quit-flush.spec.ts` y `session-errors.spec.ts` pasan.

## Medición

- Navegar durante drag, render de páginas, restore y strip de embeds.
- Registrar callbacks después de `destroyRuntimeSession`.

## Conflictos

Comparte `usePdfPersistence.ts` con PERF-01 y `PdfLayer.tsx` con PERF-04/08. Revisar lifecycle antes de introducir nuevos schedulers.
