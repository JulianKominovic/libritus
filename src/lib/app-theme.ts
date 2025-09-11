import type { ColorPalette } from "./colors";
export function resetGlobalTheme() {
  const defaultColors = {
    "50": "oklch(0.985 0 0)",
    "100": "oklch(0.97 0 0)",
    "200": "oklch(0.922 0 0)",
    "300": "oklch(0.87 0 0)",
    "400": "oklch(0.708 0 0)",
    "500": "oklch(0.556 0 0)",
    "600": "oklch(0.439 0 0)",
    "700": "oklch(0.371 0 0)",
    "800": "oklch(0.269 0 0)",
    "900": "oklch(0.205 0 0)",
  };

  Object.entries(defaultColors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(
      `--color-morphing-${key}`,
      value
    );
  });
}

export function setGlobalTheme(palette: ColorPalette) {
  Object.entries(palette.bg).forEach(([key, value]) => {
    document.documentElement.style.setProperty(
      `--color-morphing-${key}`,
      `rgb(${value})`
    );
  });

  //    Object.entries(palette.fg).forEach(([key, value]) => {
  //     document.body.style.setProperty(`--color-morphing-${key}`, value);
  //    });
}
