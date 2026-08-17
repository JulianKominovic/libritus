import chroma from 'chroma-js'

export type ColorPalette = {
  bg: {
    50: string
    100: string
    200: string
    300: string
    400: string
    500: string
    600: string
    700: string
    800: string
    900: string
  }
}

/** OKLCH L matched to App.css gray ramp (#ebebeb … #2f2f2f). */
const L = [0.9401, 0.8822, 0.8203, 0.7636, 0.7025, 0.6434, 0.5727, 0.4819, 0.3942, 0.3052]
/** Fraction of seed chroma: calm surfaces, peak at 600, taper for text. */
const C_MUL = [0.15, 0.22, 0.32, 0.42, 0.55, 0.7, 0.9, 0.82, 0.72, 0.58]

function oklchInGamut(l: number, c: number, h: number) {
  let chromaC = c
  let color = chroma.oklch(l, chromaC, h)
  while (chromaC > 0.001 && color.clipped()) {
    chromaC *= 0.92
    color = chroma.oklch(l, chromaC, h)
  }
  return color
}

export function createColorPalette(hexColor: string): ColorPalette {
  const [, seedC, seedH] = chroma(hexColor).oklch()
  const C = Number.isFinite(seedC) ? seedC : 0
  const H = Number.isFinite(seedH) ? seedH : 0
  const colors = L.map((l, i) => oklchInGamut(l, C * C_MUL[i], H))

  // ponytail: these L stops pass AA for typical hues; loop is the ceiling for pathological seeds
  if (chroma.contrast(colors[0], colors[9]) < 4.5) {
    let l900 = L[9]
    while (l900 > 0.15 && chroma.contrast(colors[0], oklchInGamut(l900, C * C_MUL[9], H)) < 4.5) {
      l900 -= 0.02
    }
    colors[9] = oklchInGamut(l900, C * C_MUL[9], H)
    let l50 = L[0]
    while (l50 < 0.98 && chroma.contrast(oklchInGamut(l50, C * C_MUL[0], H), colors[9]) < 4.5) {
      l50 += 0.01
    }
    colors[0] = oklchInGamut(l50, C * C_MUL[0], H)
  }

  const rgb = colors.map((c) =>
    c
      .rgb()
      .map((n) => Math.round(n))
      .join(' ')
  )
  return {
    bg: {
      50: rgb[0],
      100: rgb[1],
      200: rgb[2],
      300: rgb[3],
      400: rgb[4],
      500: rgb[5],
      600: rgb[6],
      700: rgb[7],
      800: rgb[8],
      900: rgb[9]
    }
  }
}
