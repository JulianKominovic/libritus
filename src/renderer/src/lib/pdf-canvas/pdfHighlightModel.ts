import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'

export type PdfHighlightData = {
  pdfHighlight: true
  text: string
  /** Shared across all rects from one text selection. Legacy: missing → treat as el.id. */
  groupId: string
}

export function isPdfHighlight(el: ExcalidrawElement): el is OrderedExcalidrawElement {
  return el.customData?.pdfHighlight === true
}

/** Logical highlight group id (legacy singles use element id). */
export function highlightGroupId(el: ExcalidrawElement): string {
  const gid = el.customData?.groupId
  return typeof gid === 'string' && gid.length > 0 ? gid : el.id
}

/** Non-deleted PDF highlight rects that share a group id. */
export function highlightGroupMembers(
  elements: readonly ExcalidrawElement[],
  groupId: string
): OrderedExcalidrawElement[] {
  return elements.filter(
    (el): el is OrderedExcalidrawElement =>
      !el.isDeleted && isPdfHighlight(el) && highlightGroupId(el) === groupId
  )
}

/** Top-most PDF highlight under scene point (later scene index wins). */
export function findPdfHighlightAt(
  elements: readonly OrderedExcalidrawElement[],
  sceneX: number,
  sceneY: number
): OrderedExcalidrawElement | null {
  let hit: OrderedExcalidrawElement | null = null
  for (const el of elements) {
    if (el.isDeleted || !isPdfHighlight(el)) continue
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
