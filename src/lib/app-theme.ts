import type { ColorPalette } from "./colors";
export function resetGlobalTheme() {
  const defaultColors = {
    "50": "rgb(235 235 235)",
    "100": "rgb(216 216 216)",
    "200": "rgb(196 196 196)",
    "300": "rgb(178 178 178)",
    "400": "rgb(159 159 159)",
    "500": "rgb(141 141 141)",
    "600": "rgb(120 120 120)",
    "700": "rgb(94 94 94)",
    "800": "rgb(70 70 70)",
    "900": "rgb(47 47 47)",
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
