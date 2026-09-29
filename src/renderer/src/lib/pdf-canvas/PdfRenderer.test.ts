import { describe, expect, test } from 'bun:test'
import { createPdfiumEngine } from '@embedpdf/engines/pdfium-direct-engine'

// ponytail: `?real` skips the process-wide mock.module('./PdfRenderer') in pool tests.
const { renderPageToCanvas } = (await import('./PdfRenderer.ts?real=1')) as typeof import('./PdfRenderer')

/**
 * Letter MediaBox with the inset CropBox that double-offset the canvas
 * (396×594). Black square sits on the crop's top-left — the region an
 * absolute crop origin shifts off the bitmap.
 */
function cropInsetPdf(): Uint8Array {
  const stream = '0 0 0 rg\n108 653 40 40 re\nf\n'
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [108 99 504 693] /Contents 4 0 R >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}endstream`
  ]
  let body = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((obj, i) => {
    offsets.push(body.length)
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`
  })
  const xrefAt = body.length
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`
  }
  const trailer = `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`
  return new TextEncoder().encode(body + xref + trailer)
}

type Captured = { data: Uint8ClampedArray; width: number; height: number }

function captureCanvas(): HTMLCanvasElement & { image: Captured | null } {
  const canvas = {
    width: 0,
    height: 0,
    image: null as Captured | null,
    getContext() {
      return {
        putImageData(image: Captured) {
          canvas.image = image
        }
      }
    }
  }
  return canvas as unknown as HTMLCanvasElement & { image: Captured | null }
}

/** Dark pixel inside the crop's top-left square (not the whole half-page). */
function topLeftHasInk(image: Captured): boolean {
  const w = Math.min(24, image.width)
  const h = Math.min(24, image.height)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * image.width + x) * 4
      const r = image.data[i] ?? 255
      const g = image.data[i + 1] ?? 255
      const b = image.data[i + 2] ?? 255
      const a = image.data[i + 3] ?? 0
      if (a > 200 && r < 40 && g < 40 && b < 40) return true
    }
  }
  return false
}

describe('renderPageToCanvas', () => {
  test(
    'inset CropBox keeps the crop top-left on the bitmap',
    async () => {
      if (typeof ImageData === 'undefined') {
        class ImageDataPoly {
          data: Uint8ClampedArray
          width: number
          height: number
          constructor(data: Uint8ClampedArray, width: number, height: number) {
            this.data = data
            this.width = width
            this.height = height
          }
        }
        ;(globalThis as { ImageData: unknown }).ImageData = ImageDataPoly
      }

      const wasmUrl = new URL('../../../public/wasm/pdfium.wasm', import.meta.url).href
      const engine = await createPdfiumEngine(wasmUrl, { fontFallback: null })
      const bytes = cropInsetPdf()
      const copy = new Uint8Array(bytes.byteLength)
      copy.set(bytes)
      const doc = await engine
        .openDocumentBuffer({ id: 'crop-inset', content: copy.buffer })
        .toPromise()
      try {
        const page = doc.pages[0]
        if (!page) throw new Error('synthetic pdf has no page')
        const canvas = captureCanvas()
        await renderPageToCanvas(engine, doc, page, canvas, 1).promise
        const image = canvas.image
        if (!image) throw new Error('render produced no pixels')
        expect(image.width).toBe(396)
        expect(image.height).toBe(594)
        expect(topLeftHasInk(image)).toBe(true)
      } finally {
        try {
          await engine.closeDocument(doc).toPromise()
        } catch {
          /* ignore */
        }
      }
    },
    20_000
  )
})
