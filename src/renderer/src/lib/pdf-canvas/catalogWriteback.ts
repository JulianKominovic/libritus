import { canvasStatsNeedWriteback, countCanvasStats } from '@renderer/lib/pdf-canvas/annotationList'
import { usePdfs } from '@renderer/stores/categories'

export function syncReadingProgress(
  categoryId: string,
  pdfId: string,
  pages: number,
  totalPages: number
) {
  const percentage = totalPages > 0 ? (pages / totalPages) * 100 : 0
  const store = usePdfs.getState()
  const pdf = store.categories.find((c) => c.id === categoryId)?.pdfs.find((p) => p.id === pdfId)
  if (
    pdf &&
    pdf.progress.pages === pages &&
    pdf.progress.percentage === percentage &&
    pdf.progress.offset === 0
  ) {
    return
  }
  void store.updatePdf(categoryId, pdfId, {
    progress: { pages, percentage, offset: 0 }
  })
}

export function syncCanvasStats(
  categoryId: string,
  pdfId: string,
  elements: Parameters<typeof countCanvasStats>[0]
) {
  const stats = countCanvasStats(elements)
  const store = usePdfs.getState()
  const pdf = store.categories.find((c) => c.id === categoryId)?.pdfs.find((p) => p.id === pdfId)
  if (!canvasStatsNeedWriteback(pdf?.canvasStats, stats)) return
  void store.updatePdf(categoryId, pdfId, { canvasStats: stats })
}
