import {
  PdfActionType,
  PdfAnnotationSubtype,
  type PdfLinkAnnoObject,
  type Rect
} from '@embedpdf/models'
import type { PdfDocument } from './PdfDocument'
import { pageIndexFromBookmarkTarget } from './pdfOutline'
import type { PageRect } from './types'

/** Internal PDF link hit in page-local + scene space. */
export type PdfLinkHit = {
  pageIndex: number
  /** 0-based destination page. */
  targetPageIndex: number
  /** Scene AABB (page origin + native rect × layout.scale). */
  x: number
  y: number
  width: number
  height: number
  /** Page-local CSS for overlays inside `[data-pdf-page]`. */
  localX: number
  localY: number
  localWidth: number
  localHeight: number
}

/** Map a LINK annotation rect (page space) onto a layout page. URI / unresolved → null. */
export function mapLinkAnnotation(
  anno: { type: number; rect: Rect; target?: PdfLinkAnnoObject['target']; pageIndex: number },
  page: PageRect,
  scale: number
): PdfLinkHit | null {
  if (anno.type !== PdfAnnotationSubtype.LINK) return null
  const target = anno.target
  // Internal only: destination or Goto. Skip URI / RemoteGoto / Launch.
  if (target?.type === 'action' && target.action.type !== PdfActionType.Goto) return null
  const targetPageIndex = pageIndexFromBookmarkTarget(target)
  if (targetPageIndex == null) return null

  const localX = anno.rect.origin.x * scale
  const localY = anno.rect.origin.y * scale
  const localWidth = anno.rect.size.width * scale
  const localHeight = anno.rect.size.height * scale
  if (localWidth <= 0 || localHeight <= 0) return null

  return {
    pageIndex: anno.pageIndex,
    targetPageIndex,
    localX,
    localY,
    localWidth,
    localHeight,
    x: page.x + localX,
    y: page.y + localY,
    width: localWidth,
    height: localHeight
  }
}

/** First link whose scene AABB contains (sceneX, sceneY), else null. */
export function findPdfLinkAt(
  links: readonly PdfLinkHit[],
  sceneX: number,
  sceneY: number
): number | null {
  for (const link of links) {
    if (
      sceneX >= link.x &&
      sceneX <= link.x + link.width &&
      sceneY >= link.y &&
      sceneY <= link.y + link.height
    ) {
      return link.targetPageIndex
    }
  }
  return null
}

/**
 * Load internal LINK annotations for one page via EmbedPDF `getPageAnnotations`.
 * Skips URI / RemoteGoto / unresolved dests. Throws if the doc/engine call fails
 * (caller should avoid caching empty on transient failure).
 */
export async function loadPageLinks(
  doc: PdfDocument,
  pageIndex: number,
  page: PageRect,
  scale: number
): Promise<PdfLinkHit[]> {
  const pageObj = await doc.getPage(pageIndex)
  const annos = await doc.engine.getPageAnnotations(doc.handle, pageObj).toPromise()
  const out: PdfLinkHit[] = []
  for (const anno of annos) {
    if (anno.type !== PdfAnnotationSubtype.LINK) continue
    const hit = mapLinkAnnotation(anno as PdfLinkAnnoObject, page, scale)
    if (hit) out.push(hit)
  }
  return out
}
