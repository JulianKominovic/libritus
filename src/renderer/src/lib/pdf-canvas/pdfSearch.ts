import type { Rect } from '@embedpdf/models'
import { mergeSameLineRects, type ClientBox } from './mergeSameLineRects'
import type { PdfDocument } from './PdfDocument'
import { cancelledReason } from './embedpdfEngine'

export type PageSpaceRect = {
  x: number
  y: number
  width: number
  height: number
}

export type SearchMatch = {
  pageIndex: number
  rects: PageSpaceRect[]
}

export function rectFromEmbed(r: Rect): PageSpaceRect {
  return {
    x: r.origin.x,
    y: r.origin.y,
    width: r.size.width,
    height: r.size.height
  }
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

export type SearchProgress = {
  matches: SearchMatch[]
  done: boolean
}

/** Session-scoped PDF text search via EmbedPDF `searchAllPages`. */
export class PdfTextSearch {
  constructor(private readonly doc: PdfDocument) {}

  clear(): void {
    /* engine search is stateless per call */
  }

  /**
   * Scan all pages for `query`. Invokes `onProgress` as pages complete.
   * Honors AbortSignal.
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
    const task = this.doc.engine.searchAllPages(this.doc.handle, q)

    if (signal) {
      const onAbort = () => {
        try {
          task.abort(cancelledReason('aborted'))
        } catch {
          /* ignore */
        }
      }
      if (signal.aborted) {
        onAbort()
        throw new DOMException('Aborted', 'AbortError')
      }
      signal.addEventListener('abort', onAbort, { once: true })
    }

    const matches: SearchMatch[] = []

    task.onProgress((progress) => {
      if (signal?.aborted) return
      for (const hit of progress.results) {
        matches.push({
          pageIndex: hit.pageIndex,
          rects: mergePageRects(hit.rects.map(rectFromEmbed))
        })
      }
      options.onProgress?.({ matches: matches.slice(), done: false })
    })

    try {
      const final = await task.toPromise()
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      // Prefer progressive accumulation; if empty, map final results.
      if (matches.length === 0 && final.results.length > 0) {
        for (const hit of final.results) {
          matches.push({
            pageIndex: hit.pageIndex,
            rects: mergePageRects(hit.rects.map(rectFromEmbed))
          })
        }
      }
      options.onProgress?.({ matches: matches.slice(), done: true })
      return matches
    } catch (err) {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      throw err
    }
  }
}
