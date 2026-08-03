import { describe, expect, test } from 'bun:test'
import { trimVisibleToCap, visibilityBuffer } from './visibilityBuffer'
import type { CameraState } from './types'

describe('visibilityBuffer', () => {
  test('equals viewport height at zoom 1', () => {
    expect(visibilityBuffer(800, 600, 1)).toBe(600)
    expect(visibilityBuffer(600, 900, 1)).toBe(900)
  })

  test('grows when zooming out (viewport-height based)', () => {
    const at1 = visibilityBuffer(800, 600, 1)
    const atHalf = visibilityBuffer(800, 600, 0.5)
    expect(atHalf).toBeGreaterThan(at1)
    expect(atHalf).toBe(1200)
  })

  test('clamps tiny zoom', () => {
    expect(visibilityBuffer(100, 100, 0)).toBe(100 / 0.01)
  })
})

describe('trimVisibleToCap', () => {
  const cam = (scrollY: number, zoom = 1): CameraState => ({
    scrollX: 0,
    scrollY,
    zoom,
    viewportWidth: 800,
    viewportHeight: 600
  })

  test('returns input under max', () => {
    expect(trimVisibleToCap([0, 1, 2], 5, cam(0), () => 0)).toEqual([0, 1, 2])
  })

  test('keeps pages nearest camera center Y', () => {
    // world center Y at scrollY=0, zoom=1, vh=600 → 300
    const pageCenterY = (i: number) => i * 1000 + 500
    const next = trimVisibleToCap([0, 1, 2, 3, 4], 2, cam(0), pageCenterY)
    // page 0 center 500 (dist 200), page 1 center 1500 (dist 1200) …
    expect(next).toEqual([0, 1])
  })
})
