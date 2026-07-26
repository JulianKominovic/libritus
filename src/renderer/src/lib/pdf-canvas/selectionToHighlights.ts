import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import { mergeSameLineRects } from './mergeSameLineRects'
import {
  highlightGroupId,
  isPdfHighlight,
  type PdfHighlightData
} from './pdfHighlightModel'

export {
  findPdfHighlightAt,
  highlightGroupId,
  highlightGroupMembers,
  isPdfHighlight,
  type PdfHighlightData
} from './pdfHighlightModel'
export { mergeSameLineRects } from './mergeSameLineRects'

const MIN_RECT_AREA = 1

export const HIGHLIGHT_COLORS = [
  { id: 'cyan', color: '#22D3EE' },
  { id: 'fuchsia', color: '#FF00FF' },
  { id: 'green', color: '#22C55E' },
  { id: 'orange', color: '#F97316' }
] as const

export const HIGHLIGHT_FILL = HIGHLIGHT_COLORS[1].color
export const HIGHLIGHT_OPACITY = 20

export function normalizeHighlightColor(color: string): string {
  return color.trim().toUpperCase()
}

/** Recolor all live highlight rects in a group. Leaves other elements untouched.
 * Must use newElementWith: Excalidraw undo deltas only fire when versionNonce changes. */
export function setHighlightGroupColor(
  elements: readonly ExcalidrawElement[],
  groupId: string,
  color: string
): OrderedExcalidrawElement[] {
  return elements.map((el) =>
    !el.isDeleted && isPdfHighlight(el) && highlightGroupId(el) === groupId
      ? (newElementWith(el, { backgroundColor: color }) as OrderedExcalidrawElement)
      : (el as OrderedExcalidrawElement)
  )
}

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
  const groupId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
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
        text,
        groupId,
        createdAt
      } satisfies PdfHighlightData
    })
  }

  return skeletons.length > 0 ? skeletons : null
}
