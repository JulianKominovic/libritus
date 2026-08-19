import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'

export type PdfNoteData = {
  pdfNote: true
  plateValue: Value
  /** Visible note color. Colored notes keep element backgroundColor 'transparent'
   *  (the Excalidraw rect is never painted); NoteEmbed paints this over the card.
   *  Absent = theme fill (backgroundColor / resolveNoteFill). */
  noteColor?: string
  /** Set when created via Add note from a highlight (for side alternation). */
  sourceHighlightId?: string
  /** ISO timestamp; stamped at create. Legacy may omit. */
  createdAt?: string
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

export function getNoteColor(el: ExcalidrawElement): string {
  const color = el.customData?.noteColor
  return typeof color === 'string' && color.trim() ? color : el.backgroundColor
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

/**
 * Excalidraw's embed "Click to interact" zone (middle third).
 * Used to suppress hover setState spam without patching Excalidraw.
 */
export function isPdfNoteCenterHit(
  el: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  sceneX: number,
  sceneY: number
): boolean {
  return (
    sceneX >= el.x + el.width / 3 &&
    sceneX <= el.x + (2 * el.width) / 3 &&
    sceneY >= el.y + el.height / 3 &&
    sceneY <= el.y + (2 * el.height) / 3
  )
}
