import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'

export type PdfNoteData = {
  pdfNote: true
  plateValue: Value
  /** Set when created via Add note from a highlight (for side alternation). */
  sourceHighlightId?: string
}

export function emptyPlateValue(): Value {
  return [{ type: 'p', children: [{ text: '' }] }]
}

export function plateValueFromQuote(quoted: string): Value {
  const text = quoted.trim()
  if (!text) return emptyPlateValue()
  return [
    { type: 'p', children: [{ text: 'Note' }] },
    { type: 'p', children: [{ text: `\u201c${text}\u201d` }] }
  ]
}

export function isPdfNote(el: ExcalidrawElement): el is OrderedExcalidrawElement {
  return el.customData?.pdfNote === true
}

export function getNotePlateValue(el: ExcalidrawElement): Value {
  const value = el.customData?.plateValue
  return Array.isArray(value) ? (value as Value) : emptyPlateValue()
}

/** Top-most PDF note under scene point (later scene index wins). */
export function findPdfNoteAt(
  elements: readonly OrderedExcalidrawElement[],
  sceneX: number,
  sceneY: number
): OrderedExcalidrawElement | null {
  let hit: OrderedExcalidrawElement | null = null
  for (const el of elements) {
    if (el.isDeleted || !isPdfNote(el)) continue
    if (
      sceneX >= el.x &&
      sceneX <= el.x + el.width &&
      sceneY >= el.y &&
      sceneY <= el.y + el.height
    ) {
      hit = el
    }
  }
  return hit
}

/** Notes whose AABB intersects the viewport AABB (scene space). */
export function queryVisibleNotes(
  elements: readonly OrderedExcalidrawElement[],
  view: { minX: number; minY: number; maxX: number; maxY: number }
): OrderedExcalidrawElement[] {
  const out: OrderedExcalidrawElement[] = []
  for (const el of elements) {
    if (el.isDeleted || !isPdfNote(el)) continue
    if (el.x + el.width < view.minX || el.x > view.maxX) continue
    if (el.y + el.height < view.minY || el.y > view.maxY) continue
    out.push(el)
  }
  return out
}
