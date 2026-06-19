import type { HighlightRect } from '@anaralabs/lector'
import type { Pdf } from '@renderer/stores/categories'

type Highlight = NonNullable<Pdf['highlights']>[0]

export const HIGHLIGHT_LINE_TOLERANCE = 4

type TopLeft = Pick<HighlightRect, 'top' | 'left'>

export function compareRectsByReadingOrder(a: TopLeft, b: TopLeft): number {
  const topDiff = a.top - b.top
  if (Math.abs(topDiff) > HIGHLIGHT_LINE_TOLERANCE) return topDiff
  return a.left - b.left
}

export function compareByTopLeft(
  aTop: number,
  aLeft: number,
  bTop: number,
  bLeft: number
): number {
  return compareRectsByReadingOrder({ top: aTop, left: aLeft }, { top: bTop, left: bLeft })
}

export function getHighlightSortRectOnPage(
  highlight: Highlight,
  pageNumber: number
): HighlightRect | undefined {
  const pageRects = highlight.rects.filter(
    (r) => r.pageNumber === pageNumber && r.left > 0 && r.top > 0
  )
  if (!pageRects.length) return undefined

  const minTop = Math.min(...pageRects.map((r) => r.top))
  const topLineRects = pageRects.filter(
    (r) => Math.abs(r.top - minTop) <= HIGHLIGHT_LINE_TOLERANCE
  )
  return topLineRects.reduce((min, r) => (r.left < min.left ? r : min))
}

function getHighlightSortRectForCompare(
  highlight: Highlight,
  pageNumber?: number
): HighlightRect | undefined {
  const page = pageNumber ?? highlight.rects[0]?.pageNumber
  if (page == null) return highlight.rects[0]
  return getHighlightSortRectOnPage(highlight, page) ?? highlight.rects[0]
}

export function compareHighlightsByPosition(
  a: Highlight,
  b: Highlight,
  pageNumber?: number
): number {
  const aRect = getHighlightSortRectForCompare(a, pageNumber)
  const bRect = getHighlightSortRectForCompare(b, pageNumber)
  if (!aRect || !bRect) return 0
  return (
    aRect.pageNumber - bRect.pageNumber || compareRectsByReadingOrder(aRect, bRect)
  )
}
