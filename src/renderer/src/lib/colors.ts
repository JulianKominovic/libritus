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
  fg: {
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
export function createColorPalette(hexColor: string): ColorPalette {
  const [h, s, l] = chroma(hexColor).hsl()
  // Old algorithm to create the color scale
  // const maxLightness = 1
  // const minLightness = 0
  // const balancedColor = chroma.hsl(h, s, Math.max(minLightness, Math.min(maxLightness, l)))
  // const colorScale = chroma
  //   .scale(['white', balancedColor, 'black'])
  //   .domain([0, 0.6, 1])
  //   .mode('oklab')
  //   .classes(12)
  //   .colors(12)
  //   .slice(1, 11)

  // This kinda enables dark mode but every palette is some variant of neon
  // const scale =
  //   l >= 0.5
  //     ? [chroma.hsl(h, s, l), chroma.hsl(h, s, 0.05)]
  //     : [chroma.hsl(h, s, 0.02), chroma.hsl(h, s, l), chroma.hsl(h, s, 1)]

  // Making mods on the old algorithm
  const colorScale = chroma
    .scale(['white', chroma.hsl(h, s, l), 'black'])
    .mode('oklab')
    .classes(12)
    .colors(undefined)
    .slice(1, 11)

  // New algorithm to create the color scale
  // const colorScale = [
  //   chroma.hsl(h, s, 0.85), // 50 - backgrounds
  //   chroma.hsl(h, s, 0.75), // 100 - hover, accents
  //   chroma.hsl(h, s, 0.7), // 200 - rings, some soft borders
  //   chroma.hsl(h, s, 0.65), // 300 - border, outline
  //   chroma.hsl(h, s, 0.6), // 400 - stronger borders, almost unused
  //   chroma.hsl(h, s, 0.5), // 500 - muted foreground
  //   chroma.hsl(h, s, 0.4), // 600 - primary color, call to actions, badges foreground
  //   chroma.hsl(h, s, 0.3), // 700 - hover foregrounds, muted foregrounds with more contrast
  //   chroma.hsl(h, s, 0.2), // 800 - foregrounds, text, icons
  //   chroma.hsl(h, s, 0.1) // 900 - the default foreground color used in like 90% of the elements, text, icons, colored shadows (used with low opacity), tooltip bg, switch bg

  //   //
  //   //
  //   //
  //   //
  //   //
  //   //
  //   // chroma.hsl(h, s, 0.9), // 50 - backgrounds
  //   // chroma.hsl(h, s, 0.83), // 100 - hover, accents
  //   // chroma.hsl(h, s, 0.77), // 200 - rings, some soft borders
  //   // chroma.hsl(h, s, 0.7), // 300 - border, outline
  //   // chroma.hsl(h, s, 0.6), // 400 - stronger borders, almost unused
  //   // chroma.hsl(h, s, 0.5), // 500 - muted foreground
  //   // chroma.hsl(h, s, 0.4), // 600 - primary color, call to actions, badges foreground
  //   // chroma.hsl(h, s, 0.3), // 700 - hover foregrounds, muted foregrounds with more contrast
  //   // chroma.hsl(h, s, 0.2), // 800 - foregrounds, text, icons
  //   // chroma.hsl(h, s, 0.1) // 900 - the default foreground color used in like 90% of the elements, text, icons, colored shadows (used with low opacity), tooltip bg, switch bg
  // ].map((color) => chroma(color).hex())
  const palette = colorScale.map((color) => chroma(color).rgb().join(' '))
  const text = colorScale.map((hex) => (chroma(hex).luminance() < 0.5 ? 'black' : 'white'))
  return {
    bg: {
      50: palette[0],
      100: palette[1],
      200: palette[2],
      300: palette[3],
      400: palette[4],
      500: palette[5],
      600: palette[6],
      700: palette[7],
      800: palette[8],
      900: palette[9]
    },
    fg: {
      50: text[0],
      100: text[1],
      200: text[2],
      300: text[3],
      400: text[4],
      500: text[5],
      600: text[6],
      700: text[7],
      800: text[8],
      900: text[9]
    }
  }
}
