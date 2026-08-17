import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import { getPdfEngine } from './embedpdfEngine'

export const PDF_CLIP_MAX_WIDTH = 280
export const PDF_CLIP_MAX_HEIGHT = 400
export const PDF_CLIP_FILL = '#e9ecef'
export const PDF_CLIP_ROUNDNESS = { type: 3 as const, value: 16 }

export type PdfClipData = {
  pdfClip: true
  /** PDF bytes in attachments/{fileId}.pdf */
  fileId: string
  /** PNG preview in attachments/{previewFileId}.png (also Excalidraw image fileId). */
  previewFileId: string
  url: string
  title: string
  capturedAt: string
  source: 'attachment'
}

export function isPdfClip(el: ExcalidrawElement): el is OrderedExcalidrawElement {
  return el.customData?.pdfClip === true
}

export function getPdfClipFileId(el: Pick<ExcalidrawElement, 'customData'>): string | null {
  return typeof el.customData?.fileId === 'string' && el.customData.fileId
    ? el.customData.fileId
    : null
}

export function getPdfClipPreviewFileId(el: Pick<ExcalidrawElement, 'customData'>): string | null {
  return typeof el.customData?.previewFileId === 'string' && el.customData.previewFileId
    ? el.customData.previewFileId
    : null
}

/** Scale src to fit max box; never upscale. */
export function fitCardSize(
  srcW: number,
  srcH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  const w = Math.max(1, srcW)
  const h = Math.max(1, srcH)
  const s = Math.min(maxW / w, maxH / h, 1)
  return { width: w * s, height: h * s }
}

export function createPdfClip(opts: {
  x: number
  y: number
  width: number
  height: number
  pdfFileId: string
  previewFileId: string
  url: string
  title: string
  capturedAt?: string
}): OrderedExcalidrawElement {
  const capturedAt = opts.capturedAt ?? new Date().toISOString()
  const customData: PdfClipData = {
    pdfClip: true,
    fileId: opts.pdfFileId,
    previewFileId: opts.previewFileId,
    url: opts.url,
    title: opts.title,
    capturedAt,
    source: 'attachment'
  }

  const [rect] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id: 'pdf-clip',
      x: opts.x,
      y: opts.y,
      width: opts.width,
      height: opts.height,
      backgroundColor: 'transparent',
      strokeColor: 'transparent',
      strokeWidth: 0,
      fillStyle: 'solid',
      roughness: 0,
      customData
    }
  ])

  if (!rect) throw new Error('createPdfClip: failed to create element')

  return newElementWith(rect, {
    type: 'image',
    fileId: opts.previewFileId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    link: null,
    backgroundColor: 'transparent',
    strokeColor: 'transparent',
    strokeWidth: 0,
    roundness: PDF_CLIP_ROUNDNESS,
    customData
  } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
}

/**
 * With previewFileId: promote to native `image`.
 * Prefer spread over newElementWith on persist (versionNonce churn).
 */
export function normalizePdfClip(el: OrderedExcalidrawElement): OrderedExcalidrawElement {
  if (!isPdfClip(el)) return el
  const previewId = getPdfClipPreviewFileId(el)
  if (!previewId) return el
  if (
    el.type === 'image' &&
    (el as { fileId?: string | null }).fileId === previewId &&
    (el as { status?: string }).status === 'saved'
  ) {
    return el
  }
  return newElementWith(el, {
    type: 'image',
    fileId: previewId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    link: null,
    roundness: PDF_CLIP_ROUNDNESS,
    customData: el.customData
  } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
}

/** Raster page 0 for a clip preview. Renderer-only (needs canvas + wasm). */
export async function rasterPdfFirstPagePng(bytes: Uint8Array): Promise<{
  png: Uint8Array
  width: number
  height: number
} | null> {
  const engine = await getPdfEngine()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const doc = await engine
    .openDocumentBuffer({
      id: crypto.randomUUID(),
      content: copy.buffer
    })
    .toPromise()
  try {
    const page = doc.pages[0]
    if (!page) return null
    const image = await engine.renderPageRaw(doc, page, { scaleFactor: 1, dpr: 1 }).toPromise()
    const canvas = document.createElement('canvas')
    canvas.width = image.width
    canvas.height = image.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    const pixels =
      image.data instanceof Uint8ClampedArray
        ? image.data
        : new Uint8ClampedArray(image.data as ArrayBuffer)
    ctx.putImageData(new ImageData(pixels, image.width, image.height), 0, 0)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) return null
    const png = new Uint8Array(await blob.arrayBuffer())
    return { png, width: image.width, height: image.height }
  } finally {
    try {
      await engine.closeDocument(doc).toPromise()
    } catch {
      /* ignore */
    }
  }
}
