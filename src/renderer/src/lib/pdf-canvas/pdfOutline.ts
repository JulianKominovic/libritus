import type { PdfBookmarkObject, PdfLinkTarget } from '@embedpdf/models'
import type { PdfDocument } from './PdfDocument'

export type OutlineNode = {
  title: string
  /** 0-based page index, or null when the destination cannot be resolved. */
  pageIndex: number | null
  children: OutlineNode[]
}

export type FlatOutlineRow = {
  title: string
  pageIndex: number | null
  depth: number
}

/** Depth-first flatten for virtualized outline lists (always expanded). */
export function flattenOutline(nodes: OutlineNode[], depth = 0): FlatOutlineRow[] {
  const out: FlatOutlineRow[] = []
  for (const n of nodes) {
    out.push({ title: n.title, pageIndex: n.pageIndex, depth })
    if (n.children.length > 0) out.push(...flattenOutline(n.children, depth + 1))
  }
  return out
}

export function pageIndexFromBookmarkTarget(target: PdfLinkTarget | undefined): number | null {
  if (!target) return null
  if (target.type === 'destination') {
    const idx = target.destination.pageIndex
    return Number.isFinite(idx) ? idx : null
  }
  if (target.type === 'action' && 'destination' in target.action) {
    const dest = (target.action as { destination?: { pageIndex?: number } }).destination
    if (dest && typeof dest.pageIndex === 'number') return dest.pageIndex
  }
  return null
}

export function mapBookmark(node: PdfBookmarkObject): OutlineNode {
  return {
    title: node.title || 'Untitled',
    pageIndex: pageIndexFromBookmarkTarget(node.target),
    children: (node.children ?? []).map(mapBookmark)
  }
}

/**
 * Load the PDF's embedded bookmarks via EmbedPDF `getBookmarks`.
 * Missing outline → []. Unresolvable dests → pageIndex null.
 */
export async function loadOutline(doc: PdfDocument): Promise<OutlineNode[]> {
  try {
    const { bookmarks } = await doc.engine.getBookmarks(doc.handle).toPromise()
    return (bookmarks ?? []).map(mapBookmark)
  } catch {
    return []
  }
}
