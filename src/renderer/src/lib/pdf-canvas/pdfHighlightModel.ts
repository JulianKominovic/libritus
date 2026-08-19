import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'

export type PdfHighlightData = {
  pdfHighlight: true
  text: string
  /** Shared across all rects from one text selection. Legacy: missing → treat as el.id. */
  groupId: string
  /** ISO timestamp; stamped at create. Legacy may omit. */
  createdAt?: string
}

/** Small, sketchy connectors between highlights and canvas artifacts. */
export const PDF_CONNECTOR_STROKE_WIDTH = 1
export const PDF_CONNECTOR_ROUGHNESS = 1
export const PDF_CONNECTOR_FALLBACK_COLOR = '#495057'

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

/** Use the highlight fill for linked connectors, with a visible legacy fallback. */
export function highlightGroupColor(
  elements: readonly ExcalidrawElement[],
  groupId: string,
  fallback = PDF_CONNECTOR_FALLBACK_COLOR
): string {
  const color = highlightGroupMembers(elements, groupId)[0]?.backgroundColor
  return color && color !== 'transparent' ? color : fallback
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
