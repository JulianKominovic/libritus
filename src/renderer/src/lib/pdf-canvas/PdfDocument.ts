import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from './pdfjs'
import type { PageSize } from './types'

/**
 * pdf.js document wrapper. Worker is configured once in main.tsx
 * (GlobalWorkerOptions.workerSrc → legacy worker). Public pageIndex is 0-based.
 */
export class PdfDocument {
  private constructor(
    readonly proxy: PDFDocumentProxy,
    readonly pageCount: number,
    readonly pageSizes: PageSize[]
  ) {}

  static async open(data: ArrayBuffer): Promise<PdfDocument> {
    const loadingTask = getDocument({ data: new Uint8Array(data) })
    const proxy = await loadingTask.promise
    const pageCount = proxy.numPages
    const pageSizes: PageSize[] = []

    for (let i = 1; i <= pageCount; i++) {
      const page = await proxy.getPage(i)
      const viewport = page.getViewport({ scale: 1 })
      pageSizes.push({ width: viewport.width, height: viewport.height })
    }

    return new PdfDocument(proxy, pageCount, pageSizes)
  }

  getPage(pageIndex: number): Promise<PDFPageProxy> {
    return this.proxy.getPage(pageIndex + 1)
  }

  async destroy(): Promise<void> {
    await this.proxy.cleanup()
    await this.proxy.loadingTask.destroy()
  }
}
