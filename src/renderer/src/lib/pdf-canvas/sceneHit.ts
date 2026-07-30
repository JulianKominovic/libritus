import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

/** Axis-aligned bounds hit (handles negative width/height). Optional pad expands the box. */
export function elementContainsPoint(
  el: Pick<OrderedExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  sceneX: number,
  sceneY: number,
  pad = 0
): boolean {
  const x1 = Math.min(el.x, el.x + el.width) - pad
  const x2 = Math.max(el.x, el.x + el.width) + pad
  const y1 = Math.min(el.y, el.y + el.height) - pad
  const y2 = Math.max(el.y, el.y + el.height) + pad
  return sceneX >= x1 && sceneX <= x2 && sceneY >= y1 && sceneY <= y2
}

/** Top-most non-deleted scene element under point (later scene index wins). */
export function findSceneElementAt(
  elements: readonly OrderedExcalidrawElement[],
  sceneX: number,
  sceneY: number,
  pad = 0
): OrderedExcalidrawElement | null {
  let hit: OrderedExcalidrawElement | null = null
  for (const el of elements) {
    if (el.isDeleted) continue
    if (elementContainsPoint(el, sceneX, sceneY, pad)) hit = el
  }
  return hit
}

/**
 * Selection or linear-point edit owns the pointer — keep `.pdf-text-pass` off so
 * arrow handles stay hittable over PDF text (hairline AABB misses).
 */
export function holdsPdfTextPassOff(appState: {
  selectedElementIds?: Record<string, boolean> | null
  editingLinearElement?: unknown
}): boolean {
  if (appState.editingLinearElement) return true
  const selected = appState.selectedElementIds
  return selected != null && Object.values(selected).some(Boolean)
}
