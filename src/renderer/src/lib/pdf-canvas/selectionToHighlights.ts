import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { AppState } from '@excalidraw/excalidraw/types'
import { mergeSameLineRects } from './mergeSameLineRects'
import type { PdfHighlightData } from './pdfHighlightModel'

export { findPdfHighlightAt, isPdfHighlight, type PdfHighlightData } from './pdfHighlightModel'
export { mergeSameLineRects } from './mergeSameLineRects'

const MIN_RECT_AREA = 1
const HIGHLIGHT_FILL = '#FF00FF'
const HIGHLIGHT_OPACITY = 20

type SceneViewport = Pick<AppState, 'zoom' | 'offsetLeft' | 'offsetTop' | 'scrollX' | 'scrollY'>

/** Same formula as Excalidraw `viewportCoordsToSceneCoords` (kept local for unit tests). */
export function clientToSceneCoords(
  clientX: number,
  clientY: number,
  appState: SceneViewport
): { x: number; y: number } {
  return {
    x: (clientX - appState.offsetLeft) / appState.zoom.value - appState.scrollX,
    y: (clientY - appState.offsetTop) / appState.zoom.value - appState.scrollY
  }
}

/**
 * Convert the current browser text selection into Excalidraw rectangle
 * skeletons aligned to scene coordinates (one rect per visual line after
 * same-line merge of client rects).
 */
export function selectionToHighlightSkeletons(
  appState: SceneViewport
): ExcalidrawElementSkeleton[] | null {
  const selection = window.getSelection()
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
    return null
  }

  const text = selection.toString()
  if (!text.trim()) {
    return null
  }

  const range = selection.getRangeAt(0)
  const lineBoxes = mergeSameLineRects(range.getClientRects())
  const skeletons: ExcalidrawElementSkeleton[] = []

  for (const box of lineBoxes) {
    const topLeft = clientToSceneCoords(box.left, box.top, appState)
    const bottomRight = clientToSceneCoords(box.right, box.bottom, appState)

    const width = bottomRight.x - topLeft.x
    const height = bottomRight.y - topLeft.y
    if (width * height < MIN_RECT_AREA) continue

    skeletons.push({
      type: 'rectangle',
      x: topLeft.x,
      y: topLeft.y,
      width,
      height,
      backgroundColor: HIGHLIGHT_FILL,
      fillStyle: 'solid',
      strokeColor: 'transparent',
      strokeWidth: 0,
      opacity: HIGHLIGHT_OPACITY,
      roughness: 0,
      locked: true,
      customData: {
        pdfHighlight: true,
        text
      } satisfies PdfHighlightData
    })
  }

  return skeletons.length > 0 ? skeletons : null
}
