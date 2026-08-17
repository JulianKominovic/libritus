import {
  PdfActionType,
  PdfAnnotationSubtype,
  type PdfLinkAnnoObject,
  type Rect
} from '@embedpdf/models'
import type { PdfDocument } from './PdfDocument'
import { pageIndexFromBookmarkTarget } from './pdfOutline'
import type { PageRect } from './types'

type PdfLinkGeom = {
  pageIndex: number
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

/** LINK hit in page-local + scene space: internal dest or http(s) URI. */
export type PdfLinkHit = PdfLinkGeom &
  ({ kind: 'internal'; targetPageIndex: number } | { kind: 'http'; url: string })

function isHttpUrl(url: string): boolean {
  try {
    const u = new URL(url)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

function linkGeom(
  anno: { pageIndex: number; rect: Rect },
  page: PageRect,
  scale: number
): PdfLinkGeom | null {
  const localX = anno.rect.origin.x * scale
  const localY = anno.rect.origin.y * scale
  const localWidth = anno.rect.size.width * scale
  const localHeight = anno.rect.size.height * scale
  if (localWidth <= 0 || localHeight <= 0) return null
  return {
    pageIndex: anno.pageIndex,
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

/** Map a LINK annotation rect (page space) onto a layout page. Unresolved / non-http URI → null. */
export function mapLinkAnnotation(
  anno: { type: number; rect: Rect; target?: PdfLinkAnnoObject['target']; pageIndex: number },
  page: PageRect,
  scale: number
): PdfLinkHit | null {
  if (anno.type !== PdfAnnotationSubtype.LINK) return null
  const geom = linkGeom(anno, page, scale)
  if (!geom) return null

  const target = anno.target
  if (target?.type === 'action' && target.action.type === PdfActionType.URI) {
    const url = 'uri' in target.action ? target.action.uri : ''
    if (typeof url !== 'string' || !isHttpUrl(url)) return null
    return { ...geom, kind: 'http', url }
  }
  // Internal: destination or Goto. Skip RemoteGoto / Launch / other actions.
  if (target?.type === 'action' && target.action.type !== PdfActionType.Goto) return null
  const targetPageIndex = pageIndexFromBookmarkTarget(target)
  if (targetPageIndex == null) return null
  return { ...geom, kind: 'internal', targetPageIndex }
}

/** First link whose scene AABB contains (sceneX, sceneY), else null. */
export function findPdfLinkAt(
  links: readonly PdfLinkHit[],
  sceneX: number,
  sceneY: number
): PdfLinkHit | null {
  for (const link of links) {
    if (
      sceneX >= link.x &&
      sceneX <= link.x + link.width &&
      sceneY >= link.y &&
      sceneY <= link.y + link.height
    ) {
      return link
    }
  }
  return null
}

/**
 * Load LINK annotations for one page via EmbedPDF `getPageAnnotations`.
 * Skips non-http URI / RemoteGoto / unresolved dests. Throws if the doc/engine
 * call fails (caller should avoid caching empty on transient failure).
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
