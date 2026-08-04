import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

type ArrowPoints = readonly [number, number][]

/**
 * Excalidraw elbow arrows refuse to render when any point is outside ±1e6
 * (common on tall PDF canvases). Host forbids elbow entirely: convert to a
 * sharp two-point arrow. CSS hide + initialData are not enough — `A` while
 * the arrow tool is active still cycles sharp → round → elbow.
 */
export function stripElbowArrows(
  elements: readonly OrderedExcalidrawElement[]
): { elements: OrderedExcalidrawElement[]; changed: boolean } {
  let changed = false
  const next = elements.map((el) => {
    if (el.isDeleted || el.type !== 'arrow') return el
    if (!(el as { elbowed?: boolean }).elbowed) return el
    changed = true
    const points = (el as { points: ArrowPoints }).points
    const start = points[0] ?? ([0, 0] as [number, number])
    const end = points.length > 1 ? points[points.length - 1]! : start
    // ponytail: plain spread — same as normalizePdfNote hot path; avoids
    // versionNonce churn and keeps bun:test free of Excalidraw runtime.
    // LocalPoint is branded; plain tuples are fine at runtime (same as tests).
    return {
      ...el,
      elbowed: false,
      points: [start, end],
      width: Math.abs(end[0] - start[0]),
      height: Math.abs(end[1] - start[1]),
      fixedSegments: null,
      startIsSpecial: null,
      endIsSpecial: null
    } as unknown as OrderedExcalidrawElement
  })
  return { elements: changed ? next : [...elements], changed }
}
