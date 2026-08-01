import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import { mergeSameLineRects, type ClientBox } from './mergeSameLineRects'
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

function pushBox(
  boxes: ClientBox[],
  rect: Pick<ClientBox, 'left' | 'top' | 'right' | 'bottom'> & { width?: number; height?: number }
): void {
  const width =
    typeof rect.width === 'number' ? rect.width : rect.right - rect.left
  const height =
    typeof rect.height === 'number' ? rect.height : rect.bottom - rect.top
  if (width * height < MIN_RECT_AREA) return
  boxes.push({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom
  })
}

/** Drop page-tall / endOfContent outliers (height ≫ typical text line). */
export function dropOversizedClientRects(boxes: ClientBox[]): ClientBox[] {
  if (boxes.length === 0) return boxes
  const heights = boxes.map((b) => b.bottom - b.top).sort((a, b) => a - b)
  const median = heights[Math.floor(heights.length / 2)]!
  const maxH = Math.max(48, median * 3)
  return boxes.filter((b) => b.bottom - b.top <= maxH)
}

function clipRangeToNode(range: Range, node: Node): Range | null {
  const doc = node.ownerDocument
  if (!doc) return null
  // Range.START_TO_START === 0, END_TO_END === 2 (avoid bare `Range` — missing in bun:test).
  const START_TO_START = 0
  const END_TO_END = 2
  try {
    const sub = doc.createRange()
    sub.selectNodeContents(node)
    if (range.compareBoundaryPoints(START_TO_START, sub) > 0) {
      sub.setStart(range.startContainer, range.startOffset)
    }
    if (range.compareBoundaryPoints(END_TO_END, sub) < 0) {
      sub.setEnd(range.endContainer, range.endOffset)
    }
    return sub
  } catch {
    return null
  }
}

/**
 * Client boxes from `.textLayer span` nodes intersecting `range`.
 * Avoids page-tall rects from `.endOfContent` / cross-page Range.getClientRects().
 * Falls back to range.getClientRects() when no text-layer spans are found (tests / odd DOM).
 */
export function clientRectsFromTextLayerSelection(range: Range): ClientBox[] {
  const boxes: ClientBox[] = []
  const ancestor = range.commonAncestorContainer
  const doc =
    (ancestor && 'ownerDocument' in ancestor ? ancestor.ownerDocument : null) ??
    (typeof document !== 'undefined' ? document : null)

  if (doc?.querySelectorAll) {
    let foundSpan = false
    for (const layer of doc.querySelectorAll('.textLayer')) {
      if (!range.intersectsNode(layer)) continue
      for (const span of layer.querySelectorAll('span')) {
        if (!range.intersectsNode(span)) continue
        foundSpan = true
        const clipped = clipRangeToNode(range, span)
        if (clipped) {
          for (const rect of Array.from(clipped.getClientRects())) {
            pushBox(boxes, rect)
          }
          continue
        }
        // Fallback when clip fails (odd DOM / tests): whole span boxes.
        if (typeof Element !== 'undefined' && span instanceof Element) {
          for (const rect of Array.from(span.getClientRects())) {
            pushBox(boxes, rect)
          }
        } else if (
          span &&
          typeof (span as { getBoundingClientRect?: () => DOMRect }).getBoundingClientRect ===
            'function'
        ) {
          pushBox(boxes, (span as Element).getBoundingClientRect())
        }
      }
    }
    if (foundSpan) return boxes
  }

  for (const rect of Array.from(range.getClientRects())) {
    pushBox(boxes, rect)
  }
  return boxes
}

/**
 * Convert the current browser text selection into Excalidraw rectangle
 * skeletons aligned to scene coordinates (one rect per visual line after
 * same-line merge of client rects).
 */
export function selectionToHighlightSkeletons(
  appState: SceneViewport,
  color: string = HIGHLIGHT_FILL
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
  const lineBoxes = mergeSameLineRects(
    dropOversizedClientRects(clientRectsFromTextLayerSelection(range))
  )
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
      backgroundColor: color,
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

/** Apply fill color to pending highlight skeletons (before they enter the scene). */
export function withHighlightSkeletonColor(
  skeletons: ExcalidrawElementSkeleton[],
  color: string
): ExcalidrawElementSkeleton[] {
  return skeletons.map((s) => ({ ...s, backgroundColor: color }))
}
