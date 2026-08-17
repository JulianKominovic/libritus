/** True for http(s) only — used for open / openExternal. */
export function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

/** True when the URL path looks like a PDF (query/hash ignored). */
export function isPdfHttpUrl(url: string): boolean {
  if (!isHttpUrl(url)) return false
  try {
    const pathname = new URL(url).pathname.toLowerCase()
    return pathname.endsWith('.pdf')
  } catch {
    return false
  }
}

/** True for PDF MIME types (charset / extra params ignored). */
export function isPdfContentType(contentType: string | null): boolean {
  const mime = contentType?.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime === 'application/pdf' || mime === 'application/x-pdf'
}

/** Google search URL for address-bar queries (spaces / not a host). */
export function googleSearchUrl(query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(query.trim() || 'search')}`
}

const PRIVILEGED_SCHEME =
  /^(javascript|data|file|about|blob|mailto|vbscript|chrome|chrome-extension|view-source|ws|wss):/i

/**
 * Address-bar input → http(s) URL, or null.
 * Bare hosts get https://; leftover text becomes a Google search.
 * javascript:/file:/data: stay rejected.
 */
export function normalizeNavigateUrl(raw: string): string | null {
  const t = raw.trim()
  if (!t) return null
  if (isHttpUrl(t)) return t
  if (PRIVILEGED_SCHEME.test(t)) return null
  if (!t.includes(' ')) {
    const withHttps = `https://${t}`
    if (isHttpUrl(withHttps)) return withHttps
  }
  return googleSearchUrl(t)
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
