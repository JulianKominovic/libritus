import type { TextItem, TextMarkedContent } from 'pdfjs-dist/types/src/display/api'
import { mergeSameLineRects, type ClientBox } from './mergeSameLineRects'
import type { PdfDocument } from './PdfDocument'

export type PageSpaceRect = {
  x: number
  y: number
  width: number
  height: number
}

export type TextSpan = {
  start: number
  end: number
  rect: PageSpaceRect
}

export type ExtractedPage = {
  text: string
  spans: TextSpan[]
}

export type SearchMatch = {
  pageIndex: number
  rects: PageSpaceRect[]
}

type ViewportLike = {
  convertToViewportPoint: (x: number, y: number) => number[]
}

function isTextItem(item: TextItem | TextMarkedContent): item is TextItem {
  return 'str' in item
}

/** Build searchable text + per-item page-space spans from pdf.js text content. */
export function extractFromTextContent(
  items: Array<TextItem | TextMarkedContent>,
  viewport: ViewportLike
): ExtractedPage {
  let text = ''
  const spans: TextSpan[] = []

  for (const item of items) {
    if (!isTextItem(item)) continue
    const str = item.str
    if (!str) {
      if (item.hasEOL) text += '\n'
      continue
    }

    const m = item.transform
    const pdfX = m[4] as number
    const pdfY = m[5] as number
    const [vx, vy] = viewport.convertToViewportPoint(pdfX, pdfY)
    const h = item.height || Math.hypot(m[2] as number, m[3] as number) || 0
    const w = item.width || 0
    // Baseline at (vx, vy); glyphs sit above the baseline in PDF → above in flipped CSS.
    const rect: PageSpaceRect = {
      x: vx ?? 0,
      y: (vy ?? 0) - h,
      width: w,
      height: h
    }

    const start = text.length
    text += str
    spans.push({ start, end: text.length, rect })
    if (item.hasEOL) text += '\n'
  }

  return { text, spans }
}

function rectForOverlap(span: TextSpan, matchStart: number, matchEnd: number): PageSpaceRect | null {
  const localStart = Math.max(span.start, matchStart) - span.start
  const localEnd = Math.min(span.end, matchEnd) - span.start
  if (localEnd <= localStart) return null
  const len = span.end - span.start
  if (len <= 0) return null
  const x = span.rect.x + (localStart / len) * span.rect.width
  const width = ((localEnd - localStart) / len) * span.rect.width
  if (width * span.rect.height < 1) return null
  return { x, y: span.rect.y, width, height: span.rect.height }
}

function mergePageRects(rects: PageSpaceRect[]): PageSpaceRect[] {
  const boxes: ClientBox[] = rects.map((r) => ({
    left: r.x,
    top: r.y,
    right: r.x + r.width,
    bottom: r.y + r.height
  }))
  return mergeSameLineRects(boxes).map((b) => ({
    x: b.left,
    y: b.top,
    width: b.right - b.left,
    height: b.bottom - b.top
  }))
}

/** Case-insensitive substring matches with page-space highlight rects. */
export function findMatchesInExtracted(
  pageIndex: number,
  extracted: ExtractedPage,
  query: string
): SearchMatch[] {
  const q = query.trim()
  if (!q) return []

  const hay = extracted.text.toLowerCase()
  const needle = q.toLowerCase()
  const matches: SearchMatch[] = []
  let from = 0

  while (from <= hay.length - needle.length) {
    const idx = hay.indexOf(needle, from)
    if (idx < 0) break
    const end = idx + needle.length
    const raw: PageSpaceRect[] = []
    for (const span of extracted.spans) {
      if (span.end <= idx || span.start >= end) continue
      const r = rectForOverlap(span, idx, end)
      if (r) raw.push(r)
    }
    if (raw.length > 0) {
      matches.push({ pageIndex, rects: mergePageRects(raw) })
    }
    from = idx + 1
  }

  return matches
}

export type SearchProgress = {
  matches: SearchMatch[]
  done: boolean
}

const DEFAULT_CONCURRENCY = 2

/**
 * Session-scoped PDF text search with page cache and bounded concurrency.
 * Does not store results in React — caller owns the match list.
 */
export class PdfTextSearch {
  private readonly cache = new Map<number, ExtractedPage>()

  constructor(private readonly doc: PdfDocument) {}

  clear(): void {
    this.cache.clear()
  }

  async ensurePage(pageIndex: number): Promise<ExtractedPage> {
    const hit = this.cache.get(pageIndex)
    if (hit) return hit

    const page = await this.doc.getPage(pageIndex)
    const content = await page.getTextContent()
    const viewport = page.getViewport({ scale: 1 })
    const extracted = extractFromTextContent(content.items, viewport)
    this.cache.set(pageIndex, extracted)
    return extracted
  }

  /**
   * Scan all pages for `query`. Invokes `onProgress` as pages complete
   * (matches accumulate). Honors AbortSignal.
   */
  async search(
    query: string,
    options: {
      signal?: AbortSignal
      concurrency?: number
      onProgress?: (progress: SearchProgress) => void
    } = {}
  ): Promise<SearchMatch[]> {
    const q = query.trim()
    if (!q) {
      options.onProgress?.({ matches: [], done: true })
      return []
    }

    const signal = options.signal
    const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY)
    const pageCount = this.doc.pageCount
    const matches: SearchMatch[] = []
    let nextIndex = 0
    let inFlight = 0

    await new Promise<void>((resolve, reject) => {
      const pump = () => {
        if (signal?.aborted) {
          reject(new DOMException('Aborted', 'AbortError'))
          return
        }
        while (inFlight < concurrency && nextIndex < pageCount) {
          const pageIndex = nextIndex++
          inFlight++
          void this.ensurePage(pageIndex)
            .then((extracted) => {
              if (signal?.aborted) return
              const pageMatches = findMatchesInExtracted(pageIndex, extracted, q)
              if (pageMatches.length > 0) {
                matches.push(...pageMatches)
                options.onProgress?.({ matches: matches.slice(), done: false })
              }
            })
            .catch((err) => {
              if (signal?.aborted) return
              reject(err)
            })
            .finally(() => {
              inFlight--
              if (signal?.aborted) {
                reject(new DOMException('Aborted', 'AbortError'))
                return
              }
              if (nextIndex >= pageCount && inFlight === 0) {
                options.onProgress?.({ matches: matches.slice(), done: true })
                resolve()
              } else {
                pump()
              }
            })
        }
        if (pageCount === 0) {
          options.onProgress?.({ matches: [], done: true })
          resolve()
        }
      }
      pump()
    })

    return matches
  }
}
