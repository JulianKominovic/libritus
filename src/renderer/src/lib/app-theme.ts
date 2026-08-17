import { createColorPalette, type ColorPalette } from './colors'

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

export function setGlobalTheme(palette: ColorPalette) {
  Object.entries(palette.bg).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--color-morphing-${key}`, `rgb(${value})`)
  })
  syncTitleBarOverlay()
}

export function resetGlobalTheme() {
  setGlobalTheme(createColorPalette('#555'))
}
