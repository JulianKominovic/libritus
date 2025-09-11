import chroma from "chroma-js";
export type ColorPalette = {
  bg: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
  fg: {
    50: string;
    100: string;
    200: string;
    300: string;
    400: string;
    500: string;
    600: string;
    700: string;
    800: string;
    900: string;
  };
};
export function createColorPalette(hexColor: string): ColorPalette {
  const [h, s, l] = chroma(hexColor).hsl();
  const maxLightness = 0.3;
  const minLightness = 0.1;
  const balancedColor = chroma.hsl(
    h,
    s,
    Math.max(minLightness, Math.min(maxLightness, l))
  );
  const colorScale = chroma
    .scale(["white", balancedColor])
    .domain([0, 0.6, 1])
    .mode("lab")
    .classes(12)
    .colors(12)
    .slice(1, 11);
  const palette = colorScale.map((color) => chroma(color).rgb().join(" "));
  const text = colorScale.map((hex) =>
    chroma(hex).luminance() < 0.5 ? "black" : "white"
  );
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
      900: palette[9],
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
      900: text[9],
    },
  };
}
