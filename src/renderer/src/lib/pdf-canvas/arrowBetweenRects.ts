/** Axis-aligned rect in scene coords. */
export type SceneRect = {
  x: number
  y: number
  width: number
  height: number
}

export type ArrowBetweenRects = {
  x: number
  y: number
  width: number
  height: number
  points: [number, number][]
  startX: number
  startY: number
  side: 'left' | 'right'
}

/** Union AABB of rects (single pass). Empty → null. */
export function unionRect(rects: readonly SceneRect[]): SceneRect | null {
  if (rects.length === 0) return null
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const r of rects) {
    minX = Math.min(minX, r.x)
    minY = Math.min(minY, r.y)
    maxX = Math.max(maxX, r.x + r.width)
    maxY = Math.max(maxY, r.y + r.height)
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY }
}

/**
 * Per-axis ends of the shortest gap between two intervals.
 * ponytail: closed-form O(1) — no candidate search over edges/midpoints.
 */
function axisEnds(a0: number, a1: number, b0: number, b1: number): [number, number] {
  if (a1 < b0) return [a1, b0]
  if (b1 < a0) return [a0, b1]
  const m = (Math.max(a0, b0) + Math.min(a1, b1)) / 2
  return [m, m]
}

function pack(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  side: 'left' | 'right'
): ArrowBetweenRects {
  const width = endX - startX
  const height = endY - startY
  return {
    x: startX,
    y: startY,
    width,
    height,
    points: [
      [0, 0],
      [width, height]
    ],
    startX,
    startY,
    side
  }
}

/**
 * Shortest connector between two AABBs (O(1) closed form).
 * Overlap both axes → horizontal facing by centers (avoid zero-length).
 */
export function arrowBetweenRects(from: SceneRect, to: SceneRect): ArrowBetweenRects {
  const [ax, bx] = axisEnds(from.x, from.x + from.width, to.x, to.x + to.width)
  const [ay, by] = axisEnds(from.y, from.y + from.height, to.y, to.y + to.height)

  const fromCx = from.x + from.width / 2
  const toCx = to.x + to.width / 2
  const side: 'left' | 'right' = toCx < fromCx ? 'left' : 'right'

  // Degenerate: rects overlap in both axes.
  if (ax === bx && ay === by) {
    const startX = side === 'right' ? from.x + from.width : from.x
    const startY = from.y + from.height / 2
    const endX = side === 'right' ? to.x : to.x + to.width
    const endY = to.y + to.height / 2
    return pack(startX, startY, endX, endY, side)
  }

  return pack(ax, ay, bx, by, side)
}
