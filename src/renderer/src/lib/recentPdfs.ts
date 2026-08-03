import type { Category, Pdf } from '@renderer/stores/categories'

export type RecentPdf = { categoryId: string; categoryName: string; pdf: Pdf }

/** Flatten categories and return PDFs newest-first by updatedAt. */
export function recentPdfs(categories: Category[], limit = 6): RecentPdf[] {
  return categories
    .flatMap((c) => c.pdfs.map((pdf) => ({ categoryId: c.id, categoryName: c.name, pdf })))
    .sort((a, b) => new Date(b.pdf.updatedAt).getTime() - new Date(a.pdf.updatedAt).getTime())
    .slice(0, limit)
}
