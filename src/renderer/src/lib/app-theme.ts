import type { ColorPalette } from './colors'

function rgbCssToHex(css: string, fallback: string): string {
  const m = css.match(/(\d+)\D+(\d+)\D+(\d+)/)
  if (!m) return fallback
  return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('')
}

/** Windows/Linux caption buttons follow the active morphing palette. */
function syncTitleBarOverlay(): void {
  if (typeof window === 'undefined' || window.electron?.process?.platform === 'darwin') return
  const styles = getComputedStyle(document.documentElement)
  const color = rgbCssToHex(styles.getPropertyValue('--color-morphing-50'), '#ebebeb')
  const symbolColor = rgbCssToHex(styles.getPropertyValue('--color-morphing-900'), '#2f2f2f')
  void window.electron.ipcRenderer.invoke('window:set-title-bar-overlay', { color, symbolColor })
}

export function resetGlobalTheme() {
  const defaultColors = {
    '50': 'rgb(235 235 235)',
    '100': 'rgb(216 216 216)',
    '200': 'rgb(196 196 196)',
    '300': 'rgb(178 178 178)',
    '400': 'rgb(159 159 159)',
    '500': 'rgb(141 141 141)',
    '600': 'rgb(120 120 120)',
    '700': 'rgb(94 94 94)',
    '800': 'rgb(70 70 70)',
    '900': 'rgb(47 47 47)'
  }

  Object.entries(defaultColors).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--color-morphing-${key}`, value)
  })
  syncTitleBarOverlay()
}

export function setGlobalTheme(palette: ColorPalette) {
  Object.entries(palette.bg).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--color-morphing-${key}`, `rgb(${value})`)
  })
  syncTitleBarOverlay()

  //    Object.entries(palette.fg).forEach(([key, value]) => {
  //     document.body.style.setProperty(`--color-morphing-${key}`, value);
  //    });
}
