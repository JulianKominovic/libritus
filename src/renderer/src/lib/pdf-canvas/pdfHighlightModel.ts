import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'

export type PdfHighlightData = {
  pdfHighlight: true
  text: string
}

export function isPdfHighlight(el: ExcalidrawElement): el is OrderedExcalidrawElement {
  return el.customData?.pdfHighlight === true
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
