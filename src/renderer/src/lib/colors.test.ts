import { describe, expect, test } from 'bun:test'
import chroma from 'chroma-js'
import { createColorPalette } from './colors'

const STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
const SEEDS = ['#ff0000', '#ffff00', '#0000ff', '#00ff00', '#000', '#fff', '#555']

function swatch(rgb: string) {
  return chroma(`rgb(${rgb})`)
}

describe('createColorPalette', () => {
  test('contrast, L ramp, gray seeds', () => {
    for (const seed of SEEDS) {
      const { bg } = createColorPalette(seed)
      expect(chroma.contrast(swatch(bg[50]), swatch(bg[900]))).toBeGreaterThanOrEqual(4.5)
      const Ls = STEPS.map((step) => swatch(bg[step]).oklch()[0])
      for (let i = 1; i < Ls.length; i++) {
        expect(Ls[i]).toBeLessThan(Ls[i - 1])
      }
    }
    const gray = createColorPalette('#555').bg
    expect(swatch(gray[50]).oklch()[1]!).toBeLessThan(0.01)
    expect(swatch(gray[900]).oklch()[1]!).toBeLessThan(0.01)
  })
})
