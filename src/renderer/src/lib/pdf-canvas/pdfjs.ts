/**
 * Electron's Chromium may lack Map.prototype.getOrInsertComputed.
 * pdf.js 6 needs it — always load the legacy build (includes polyfills).
 *
 * Worker must be set here (not only in PdfDocument): category upload uses
 * getDocument via lib/pdf.ts before the canvas module ever loads.
 *
 * wasmUrl is required for JBIG2 / JPEG2000 / ICC (scanned image PDFs).
 * Files are copied to public/wasm by postinstall (same pattern as Excalidraw fonts).
 * URL: origin `/wasm/` on http(s); next to index.html on file: (see pdfjsWasmUrlFrom).
 */
import {
  GlobalWorkerOptions,
  getDocument as pdfjsGetDocument
} from 'pdfjs-dist/legacy/build/pdf.mjs'

GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

/**
 * Base URL for pdfjs-dist/wasm (trailing slash).
 * http(s): origin root (browser routes are /pdf/… — must not resolve under the route).
 * file: next to index.html (same as EXCALIDRAW_ASSET_PATH).
 */
export function pdfjsWasmUrlFrom(protocol: string, origin: string, baseURI: string): string {
  return protocol === 'file:' ? new URL('wasm/', baseURI).href : `${origin}/wasm/`
}

export function pdfjsWasmUrl(): string {
  if (typeof location === 'undefined' || typeof document === 'undefined') return ''
  if (!document.baseURI) return ''
  return pdfjsWasmUrlFrom(location.protocol, location.origin, document.baseURI)
}

export function getDocument(
  src: Parameters<typeof pdfjsGetDocument>[0]
): ReturnType<typeof pdfjsGetDocument> {
  return pdfjsGetDocument({ wasmUrl: pdfjsWasmUrl(), ...src })
}

export { GlobalWorkerOptions, setLayerDimensions, TextLayer } from 'pdfjs-dist/legacy/build/pdf.mjs'

export type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist'
