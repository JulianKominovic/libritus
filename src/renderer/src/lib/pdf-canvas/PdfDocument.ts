import type { PdfDocumentObject, PdfEngine, PdfPageObject } from '@embedpdf/models'
import { getPdfEngine } from './embedpdfEngine'
import type { PageSize } from './types'

/**
 * PDFium document wrapper (EmbedPDF engine). Public pageIndex is 0-based.
 *
 * `open` owns close via the engine. `wrap` is for DocumentManager-owned docs
 * (SelectionPlugin) — destroy only marks dead; caller closes via DocumentManager.
 */
export class PdfDocument {
  private alive = true
  private readonly ownsClose: boolean

  private constructor(
    readonly engine: PdfEngine<Blob>,
    readonly handle: PdfDocumentObject,
    readonly pageCount: number,
    readonly pageSizes: PageSize[],
    ownsClose: boolean
  ) {
    this.ownsClose = ownsClose
  }

  static wrap(
    engine: PdfEngine<Blob>,
    handle: PdfDocumentObject,
    options?: { ownsClose?: boolean }
  ): PdfDocument {
    const pageSizes: PageSize[] = handle.pages.map((p) => ({
      width: p.size.width,
      height: p.size.height
    }))
    return new PdfDocument(engine, handle, handle.pageCount, pageSizes, options?.ownsClose ?? false)
  }

  static async open(data: ArrayBuffer): Promise<PdfDocument> {
    const engine = await getPdfEngine()
    const handle = await engine
      .openDocumentBuffer({
        id: crypto.randomUUID(),
        content: data
      })
      .toPromise()

    return PdfDocument.wrap(engine, handle, { ownsClose: true })
  }

  /** Page object for render/text APIs. Rejects if destroyed (pools treat as cancel). */
  getPage(pageIndex: number): Promise<PdfPageObject> {
    if (!this.alive) {
      const err = new Error('PDF document destroyed')
      err.name = 'AbortException'
      return Promise.reject(err)
    }
    const page = this.handle.pages[pageIndex]
    if (!page) {
      return Promise.reject(new Error(`Invalid page index ${pageIndex}`))
    }
    return Promise.resolve(page)
  }

  async destroy(): Promise<void> {
    this.alive = false
    if (!this.ownsClose) return
    try {
      await this.engine.closeDocument(this.handle).toPromise()
    } catch {
      /* already closed / worker gone */
    }
  }
}
