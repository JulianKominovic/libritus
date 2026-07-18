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

  test('pageIndexAtWorldPoint: on page, in gap, outside stack', () => {
    const p0 = layout.pages[0]!
    const p1 = layout.pages[1]!
    expect(layout.pageIndexAtWorldPoint(0, p0.y + 10)).toBe(0)
    // Gap between page 0 and 1
    const gapY = p0.y + p0.height + 12
    expect(layout.pageIndexAtWorldPoint(0, gapY)).toBe(0)
    // Above stack → nearest page 0
    expect(layout.pageIndexAtWorldPoint(0, -50)).toBe(0)
    // Below last page → nearest last
    const last = layout.pages[2]!
    expect(layout.pageIndexAtWorldPoint(0, last.y + last.height + 100)).toBe(2)
    expect(layout.pageIndexAtWorldPoint(0, p1.y + 5)).toBe(1)
  })

  test('scrollForPageCenter returns null for out-of-range index', () => {
    const camera = {
      zoom: 1,
      viewportHeight: 200
    }
    expect(layout.scrollForPageCenter(-1, camera)).toBeNull()
    expect(layout.scrollForPageCenter(99, camera)).toBeNull()
  })

  test('empty layout returns null', () => {
    const empty = new PageLayout([])
    expect(empty.pageIndexAtWorldPoint(0, 0)).toBeNull()
  })
})
