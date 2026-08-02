import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

type HitBounds = Pick<OrderedExcalidrawElement, 'x' | 'y' | 'width' | 'height'> & {
  /** Linear / freedraw: offsets from (x,y). Excalidraw width/height is the box size, not direction. */
  points?: readonly (readonly [number, number])[] | null
}

/**
 * Axis-aligned bounds hit. Optional pad expands the box.
 * With `points`, AABB is from absolute point coords — not (x,y)+(width,height).
 * Freehand arrows often store positive width/height while points go negative;
 * treating size as down-right from (x,y) invents a phantom box over PDF text.
 */
export function elementContainsPoint(
  el: HitBounds,
  sceneX: number,
  sceneY: number,
  pad = 0
): boolean {
  let x1: number
  let x2: number
  let y1: number
  let y2: number
  const pts = el.points
  if (pts != null && pts.length > 0) {
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (const p of pts) {
      const ax = el.x + p[0]
      const ay = el.y + p[1]
      if (ax < minX) minX = ax
      if (ax > maxX) maxX = ax
      if (ay < minY) minY = ay
      if (ay > maxY) maxY = ay
    }
    x1 = minX - pad
    x2 = maxX + pad
    y1 = minY - pad
    y2 = maxY + pad
  } else {
    x1 = Math.min(el.x, el.x + el.width) - pad
    x2 = Math.max(el.x, el.x + el.width) + pad
    y1 = Math.min(el.y, el.y + el.height) - pad
    y2 = Math.max(el.y, el.y + el.height) + pad
  }
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
