import { describe, expect, test } from 'bun:test'
import { PageLayout, worldAABBFromCamera } from './PageLayout'
import type { CameraState } from './types'

describe('PageLayout', () => {
  const layout = new PageLayout([
    { width: 100, height: 200 },
    { width: 100, height: 200 },
    { width: 100, height: 200 }
  ])

  test('stacks pages with gap', () => {
    expect(layout.pages.length).toBe(3)
    expect(layout.pages[1]!.y).toBe(200 + 24)
  })

  test('queryVisible finds page under camera', () => {
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
    expect(layout.queryVisible(aabb, 0)).toContain(1)
  })

  test('pageIndexForCamera and scrollForPageCenter', () => {
    const camera: CameraState = {
      scrollX: 0,
      scrollY: -layout.pages[1]!.y,
      zoom: 1,
      viewportWidth: 100,
      viewportHeight: 200
    }
    expect(layout.pageIndexForCamera(camera)).toBe(1)
    const jump = layout.scrollForPageCenter(0, camera)
    expect(jump).not.toBeNull()
    expect(typeof jump!.scrollY).toBe('number')
  })
})
