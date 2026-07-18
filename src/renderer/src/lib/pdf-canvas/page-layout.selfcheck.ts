/**
 * Minimal runnable check for PageLayout culling / page-from-camera helpers.
 * Run: bun src/renderer/src/lib/pdf-canvas/page-layout.selfcheck.ts
 */
import { PageLayout, worldAABBFromCamera } from './PageLayout'
import type { CameraState } from './types'

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

const layout = new PageLayout([
  { width: 100, height: 200 },
  { width: 100, height: 200 },
  { width: 100, height: 200 }
])

assert(layout.pages.length === 3, 'expected 3 pages')
assert(layout.pages[1]!.y === 200 + 24, 'page 1 y includes gap')

const camera: CameraState = {
  scrollX: 0,
  scrollY: -layout.pages[1]!.y,
  zoom: 1,
  viewportWidth: 100,
  viewportHeight: 200
}

const aabb = worldAABBFromCamera(
  camera.scrollX,
  camera.scrollY,
  camera.zoom,
  camera.viewportWidth,
  camera.viewportHeight
)
const visible = layout.queryVisible(aabb, 0)
assert(visible.includes(1), `page 1 should be visible, got ${visible.join(',')}`)

const pageAtCenter = layout.pageIndexForCamera(camera)
assert(pageAtCenter === 1, `expected page 1 at center, got ${pageAtCenter}`)

const jump = layout.scrollForPageCenter(0, camera)
assert(jump != null, 'scrollForPageCenter(0) should return')
assert(typeof jump!.scrollY === 'number', 'scrollY must be number')

console.log('page-layout.selfcheck: ok')
