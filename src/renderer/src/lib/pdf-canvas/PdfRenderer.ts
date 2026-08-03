import type { PdfDocumentObject, PdfPageObject, PdfEngine } from '@embedpdf/models'
import { cancelledReason } from './embedpdfEngine'

/**
 * Default bitmap density (device px per world CSS px at zoom 1).
 * PagePool should pass renderScaleForWorld(worldScale) instead of this alone.
 */
export const FIXED_RENDER_SCALE = 2

export type AbortableRender = {
  promise: Promise<void>
  cancel: () => void
}

/**
 * Render a page into `canvas` via PDFium `renderPageRaw`.
 * Returns an abortable handle (same shape PagePool/ThumbPool expect).
 */
export function renderPageToCanvas(
  engine: PdfEngine<Blob>,
  doc: PdfDocumentObject,
  page: PdfPageObject,
  canvas: HTMLCanvasElement,
  scale: number = FIXED_RENDER_SCALE
): AbortableRender {
  const task = engine.renderPageRaw(doc, page, { scaleFactor: scale, dpr: 1 })

  const promise = task.toPromise().then((image) => {
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Failed to get 2d context')
    const pixels =
      image.data instanceof Uint8ClampedArray
        ? image.data
        : new Uint8ClampedArray(image.data as ArrayBuffer)
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0)
  })

  return {
    promise,
    cancel: () => {
      try {
        task.abort(cancelledReason())
      } catch {
        /* ignore */
      }
    }
  }
}
