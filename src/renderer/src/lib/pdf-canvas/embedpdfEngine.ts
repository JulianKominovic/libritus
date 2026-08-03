/**
 * Shared PDFium engine (EmbedPDF). Worker + local wasm — same singleton for
 * canvas open and category upload thumbs.
 *
 * wasm: http(s) → origin `/wasm/pdfium.wasm`; file: next to index.html.
 */
import { createPdfiumEngine } from '@embedpdf/engines/pdfium-worker-engine'
import type { PdfEngine } from '@embedpdf/engines'
import { PdfErrorCode, type PdfErrorReason } from '@embedpdf/models'

export function pdfiumWasmUrlFrom(protocol: string, origin: string, baseURI: string): string {
  return protocol === 'file:'
    ? new URL('wasm/pdfium.wasm', baseURI).href
    : `${origin}/wasm/pdfium.wasm`
}

export function pdfiumWasmUrl(): string {
  if (typeof location === 'undefined' || typeof document === 'undefined') return ''
  if (!document.baseURI) return ''
  return pdfiumWasmUrlFrom(location.protocol, location.origin, document.baseURI)
}

export function cancelledReason(message = 'cancelled'): PdfErrorReason {
  return { code: PdfErrorCode.Cancelled, message }
}

let enginePromise: Promise<PdfEngine<Blob>> | null = null

/** Lazy singleton. fontFallback null — no CDN font fetches in Electron. */
export function getPdfEngine(): Promise<PdfEngine<Blob>> {
  if (!enginePromise) {
    const wasmUrl = pdfiumWasmUrl()
    if (!wasmUrl) {
      enginePromise = Promise.reject(new Error('PDFium wasm URL unavailable'))
    } else {
      // Worker create is sync; first Task waits for wasmInit ready.
      enginePromise = Promise.resolve(
        createPdfiumEngine(wasmUrl, { fontFallback: null }) as PdfEngine<Blob>
      )
    }
  }
  return enginePromise
}
