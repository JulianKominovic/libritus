import { describe, expect, test } from 'bun:test'
import { screenDeltaToPdfPoint } from './screenDeltaToPdfPoint'

describe('screenDeltaToPdfPoint', () => {
  test('zoom 1: screen delta / scale only', () => {
    expect(screenDeltaToPdfPoint(200, 100, 1, 2)).toEqual({ x: 100, y: 50 })
  })

  test('zoom 2: undoes CSS scale so mid-page maps correctly', () => {
    // Layout page height 800, scale 1 → native 800. At zoom 2, mid-page screen dy = 800.
    expect(screenDeltaToPdfPoint(0, 800, 2, 1)).toEqual({ x: 0, y: 400 })
  })

  test('zoom 2 + worldScale: compound denom', () => {
    expect(screenDeltaToPdfPoint(400, 200, 2, 2)).toEqual({ x: 100, y: 50 })
  })
})
