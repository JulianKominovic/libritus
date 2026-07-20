import { describe, expect, test } from 'bun:test'
import {
  REFERENCE_PAGE_WIDTH,
  pageWorldScale,
  scaleSessionScene
} from './pageWorldScale'

describe('pageWorldScale', () => {
  test('Letter width → scale ≈ 1', () => {
    const { scale, sizes } = pageWorldScale([{ width: 612, height: 792 }])
    expect(scale).toBe(1)
    expect(sizes[0]).toEqual({ width: 612, height: 792 })
  })

  test('300-wide → scale 2', () => {
    const { scale, sizes } = pageWorldScale([{ width: 300, height: 400 }])
    expect(scale).toBe(REFERENCE_PAGE_WIDTH / 300)
    expect(sizes[0]!.width).toBe(REFERENCE_PAGE_WIDTH)
    expect(sizes[0]!.height).toBeCloseTo(400 * scale)
  })

  test('1224-wide → scale 0.5', () => {
    const { scale, sizes } = pageWorldScale([{ width: 1224, height: 1584 }])
    expect(scale).toBe(0.5)
    expect(sizes[0]).toEqual({ width: 612, height: 792 })
  })

  test('uses max width across pages', () => {
    const { scale, sizes } = pageWorldScale([
      { width: 300, height: 400 },
      { width: 600, height: 800 }
    ])
    expect(scale).toBe(REFERENCE_PAGE_WIDTH / 600)
    expect(sizes[1]!.width).toBe(REFERENCE_PAGE_WIDTH)
    expect(sizes[0]!.width).toBeCloseTo(300 * scale)
  })

  test('empty → scale 1', () => {
    expect(pageWorldScale([])).toEqual({ scale: 1, sizes: [] })
  })
})

describe('scaleSessionScene', () => {
  test('scale 1 is identity', () => {
    const elements = [{ id: 'a', x: 10, y: 20, width: 30, height: 40 }]
    const camera = { scrollX: 1, scrollY: 2, zoom: 1.5 }
    const out = scaleSessionScene(elements, camera, 1)
    expect(out.elements).toBe(elements)
    expect(out.camera).toBe(camera)
  })

  test('scales absolute geometry and scroll; leaves zoom and points', () => {
    const elements = [
      {
        id: 'a',
        x: 100,
        y: 200,
        width: 50,
        height: 60,
        points: [
          [0, 0],
          [10, 10]
        ]
      }
    ]
    const camera = { scrollX: 10, scrollY: -20, zoom: 2 }
    const out = scaleSessionScene(elements, camera, 0.5)
    expect(out.camera).toEqual({ scrollX: 5, scrollY: -10, zoom: 2 })
    expect(out.elements[0]).toEqual({
      id: 'a',
      x: 50,
      y: 100,
      width: 25,
      height: 30,
      points: [
        [0, 0],
        [10, 10]
      ]
    })
  })
})
