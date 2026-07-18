/**
 * Electron's Chromium may lack Map.prototype.getOrInsertComputed.
 * pdf.js 6 needs it — always load the legacy build (includes polyfills).
 */
export {
  getDocument,
  GlobalWorkerOptions,
  TextLayer,
  setLayerDimensions
} from 'pdfjs-dist/legacy/build/pdf.mjs'

export type {
  PDFDocumentProxy,
  PDFPageProxy,
  RenderTask
} from 'pdfjs-dist'
