/**
 * Electron's Chromium may lack Map.prototype.getOrInsertComputed.
 * pdf.js 6 needs it — always load the legacy build (includes polyfills).
 *
 * Worker must be set here (not only in PdfDocument): category upload uses
 * getDocument via lib/pdf.ts before the canvas module ever loads.
 */
import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

export {
  getDocument,
  GlobalWorkerOptions, setLayerDimensions, TextLayer
} from 'pdfjs-dist/legacy/build/pdf.mjs'

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
