import type { PDFPageProxy, RenderTask } from './pdfjs'

/**
 * Default bitmap density (device px per world CSS px at zoom 1).
 * PagePool should pass renderScaleForWorld(worldScale) instead of this alone.
 */
export const FIXED_RENDER_SCALE = 2

export async function renderPageToCanvas(
  page: PDFPageProxy,
  canvas: HTMLCanvasElement,
  scale: number = FIXED_RENDER_SCALE
): Promise<RenderTask> {
  const viewport = page.getViewport({ scale })
  canvas.width = Math.floor(viewport.width)
  canvas.height = Math.floor(viewport.height)

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Failed to get 2d context')
  }

  const task = page.render({
    canvasContext: ctx,
    viewport,
    canvas
  })
  return task
}
