import type { CameraState, WorldAABB } from './types'
import { worldAABBFromCamera } from './PageLayout'
import { capPreferCenter } from './PagePool'

/**
 * Extra world-space padding around the viewport AABB when querying visible pages.
 * One viewport-height of pad (not max(vw,vh)/zoom on all sides) — AGENTS.md lever.
 */
export function visibilityBuffer(
  _viewportWidth: number,
  viewportHeight: number,
  zoom: number
): number {
  return viewportHeight / Math.max(zoom, 0.01)
}

/** World AABB + buffer used by PdfLayer for page culling. */
export function visiblePagesQuery(
  camera: CameraState
): { aabb: WorldAABB; buffer: number } {
  const aabb = worldAABBFromCamera(
    camera.scrollX,
    camera.scrollY,
    camera.zoom,
    camera.viewportWidth,
    camera.viewportHeight
  )
  return {
    aabb,
    buffer: visibilityBuffer(camera.viewportWidth, camera.viewportHeight, camera.zoom)
  }
}

/**
 * Hard-cap visible page indices to those nearest the camera center (world Y).
 * Falls back to mid-list preference when layout sizes are unavailable.
 */
export function trimVisibleToCap(
  indices: number[],
  max: number,
  camera: CameraState,
  pageCenterY: (pageIndex: number) => number | undefined
): number[] {
  if (indices.length <= max) return indices

  const worldCenterY =
    -camera.scrollY + camera.viewportHeight / (2 * Math.max(camera.zoom, 0.01))

  const ranked = indices
    .map((pageIndex) => {
      const cy = pageCenterY(pageIndex)
      return {
        pageIndex,
        dist: cy === undefined ? Number.POSITIVE_INFINITY : Math.abs(cy - worldCenterY)
      }
    })
    .sort((a, b) => a.dist - b.dist || a.pageIndex - b.pageIndex)

  if (ranked.every((r) => !Number.isFinite(r.dist))) {
    return capPreferCenter(indices, max)
  }

  return ranked
    .slice(0, max)
    .map((r) => r.pageIndex)
    .sort((a, b) => a - b)
}
