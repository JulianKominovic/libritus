import { compareByTopLeft } from '@renderer/lib/sort-highlights'

export const COMMENT_LAYOUT_GAP = 8
export const ESTIMATED_COMMENT_HEIGHT = 80

export type CommentLayoutItem = {
  id: string
  anchorTop: number
  anchorLeft?: number
  height: number
}

export type CommentLayoutPosition = CommentLayoutItem & {
  top: number
}

export function layoutCommentPositions(
  items: CommentLayoutItem[],
  gap = COMMENT_LAYOUT_GAP
): CommentLayoutPosition[] {
  const sorted = [...items].sort((a, b) =>
    compareByTopLeft(a.anchorTop, a.anchorLeft ?? 0, b.anchorTop, b.anchorLeft ?? 0)
  )
  let lastBottom = -Infinity

  return sorted.map((item) => {
    const top = Math.max(item.anchorTop, lastBottom + gap)
    lastBottom = top + item.height
    return { ...item, top }
  })
}
