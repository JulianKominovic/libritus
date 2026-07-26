/** True for http(s) only — used for open / openExternal. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * True when navigation should be blocked.
 * Allows about:blank (Chromium mid-navigation). Blocks privileged schemes.
 */
export function isBlockedUrl(url: string): boolean {
  try {
    const u = new URL(url)
    if (u.protocol === 'about:') return false
    return u.protocol !== 'http:' && u.protocol !== 'https:'
  } catch {
    return true
  }
}

/** Strip `Electron/x.y` so naive UA sniffers treat the guest as Chrome. */
export function chromeLikeUserAgent(raw: string): string {
  return raw
    .replace(/\sElectron\/\S+/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}
