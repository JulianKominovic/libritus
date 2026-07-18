import { describe, expect, test } from 'bun:test'
import { visibilityBuffer } from './visibilityBuffer'

describe('visibilityBuffer', () => {
  test('equals max viewport side at zoom 1', () => {
    expect(visibilityBuffer(800, 600, 1)).toBe(800)
    expect(visibilityBuffer(600, 900, 1)).toBe(900)
  })

  test('grows when zooming out', () => {
    const at1 = visibilityBuffer(800, 600, 1)
    const atHalf = visibilityBuffer(800, 600, 0.5)
    expect(atHalf).toBeGreaterThan(at1)
    expect(atHalf).toBe(1600)
  })

  test('clamps tiny zoom', () => {
    expect(visibilityBuffer(100, 100, 0)).toBe(100 / 0.01)
  })
})
