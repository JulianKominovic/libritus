import type { CameraState, WorldAABB } from './types'
import { worldAABBFromCamera } from './PageLayout'

/**
 * Extra world-space padding around the viewport AABB when querying visible pages.
 * Grows as zoom shrinks — primary lever for pool pressure (see AGENTS.md).
 */
export function visibilityBuffer(
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): number {
  return Math.max(viewportWidth, viewportHeight) / Math.max(zoom, 0.01)
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
