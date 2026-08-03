import { newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform'
import type { Rect } from '@embedpdf/models'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { AppState } from '@excalidraw/excalidraw/types'
import type { PageLayout } from './PageLayout'
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

/** EmbedPDF FormattedSelection shape (avoid pulling plugin runtime into unit tests). */
export type FormattedSelection = {
  pageIndex: number
  rect: Rect
  segmentRects: Rect[]
}

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
 * EmbedPDF `getFormattedSelection()` segment rects (PDF page space) → Excalidraw
 * highlight skeletons in scene/world space via PageLayout.
 */
export function formattedSelectionToHighlightSkeletons(
  formatted: FormattedSelection[],
  text: string,
  layout: PageLayout,
  color: string = HIGHLIGHT_FILL
): ExcalidrawElementSkeleton[] | null {
  const trimmed = text.trim()
  if (formatted.length === 0) return null

  const groupId = crypto.randomUUID()
  const createdAt = new Date().toISOString()
  const skeletons: ExcalidrawElementSkeleton[] = []
  const s = layout.scale

  for (const pageSel of formatted) {
    const page = layout.pages[pageSel.pageIndex]
    if (!page) continue
    for (const rect of pageSel.segmentRects) {
      const width = rect.size.width * s
      const height = rect.size.height * s
      if (width * height < MIN_RECT_AREA) continue
      skeletons.push({
        type: 'rectangle',
        x: page.x + rect.origin.x * s,
        y: page.y + rect.origin.y * s,
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
          text: trimmed,
          groupId,
          createdAt
        } satisfies PdfHighlightData
      })
    }
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
