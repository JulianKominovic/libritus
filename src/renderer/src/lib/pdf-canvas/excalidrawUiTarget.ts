/**
 * Excalidraw / host chrome that sits over the scene.
 * Host scene hit-tests must ignore these or style-panel clicks activate embeds underneath.
 */
export const EXCALIDRAW_UI_POINTER_SELECTOR =
  '[data-pdf-sidebar], .layer-ui__wrapper, .context-menu, .excalidraw-toast-container'

/** True when the event target is (or is inside) UI chrome, not the canvas/embeds. */
export function isExcalidrawUiPointerTarget(target: EventTarget | null): boolean {
  // Duck-type: instanceof Element breaks across JSDOM / window realms.
  if (!target || typeof (target as Element).closest !== 'function') return false
  return !!(target as Element).closest(EXCALIDRAW_UI_POINTER_SELECTOR)
}
