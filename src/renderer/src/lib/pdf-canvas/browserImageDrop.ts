/** Chrome/browser image drag: HTML + uri-list, usually no Files. */

const IMG_SRC_RE = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']/i
const IMAGE_PATH_RE = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(?:$|[?#])/i

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function decodeBasicHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
}

/** First absolute http(s) `<img src>` in clipboard/drag HTML. */
export function imageUrlFromHtml(html: string): string | null {
  const m = IMG_SRC_RE.exec(html)
  if (!m?.[1]) return null
  const src = decodeBasicHtmlEntities(m[1].trim())
  return isHttpUrl(src) ? src : null
}

/** First http(s) line in uri-list whose path looks like an image file. */
export function imageUrlFromUriList(uriList: string): string | null {
  for (const line of uriList.split(/\r?\n/)) {
    const url = line.trim()
    if (!url || url.startsWith('#')) continue
    if (!isHttpUrl(url)) continue
    try {
      if (IMAGE_PATH_RE.test(new URL(url).pathname)) return url
    } catch {
      continue
    }
  }
  return null
}

/**
 * URL to fetch and insert as an Excalidraw image, or null to leave the drop alone.
 * Prefer HTML img src (Chrome often puts the page in uri-list).
 */
export function imageUrlFromDataTransfer(dt: DataTransfer | null | undefined): string | null {
  if (!dt) return null
  if (dt.files?.length) return null
  const html = dt.getData('text/html') ?? ''
  if (html) {
    const fromHtml = imageUrlFromHtml(html)
    if (fromHtml) return fromHtml
  }
  const uri = dt.getData('text/uri-list') ?? ''
  if (uri) return imageUrlFromUriList(uri)
  return null
}

/**
 * dragover hint: Chrome image drags expose html/uri-list types (often without Files).
 * getData is empty during dragover — only types are reliable.
 */
export function dataTransferLooksLikeBrowserImageDrag(
  dt: DataTransfer | null | undefined
): boolean {
  if (!dt) return false
  if (dt.files?.length) return false
  const types = Array.from(dt.types ?? [])
  return types.includes('text/html') || types.includes('text/uri-list')
}

export function isImageMime(contentType: string | null | undefined): boolean {
  if (!contentType) return false
  const mime = contentType.split(';')[0]?.trim().toLowerCase() ?? ''
  return mime.startsWith('image/')
}
