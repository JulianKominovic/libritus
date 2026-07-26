import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import { arrowBetweenRects, unionRect } from './arrowBetweenRects'
import { highlightGroupId, highlightGroupMembers } from './pdfHighlightModel'

export type PdfSearchCaptureData = {
  pdfSearchCapture: true
  query: string
  url: string
  sourceHighlightId?: string
  fileId?: string
  capturedAt?: string
}

export function isPdfSearchCapture(el: ExcalidrawElement): el is OrderedExcalidrawElement {
  return el.customData?.pdfSearchCapture === true
}

export function getSearchCaptureQuery(el: ExcalidrawElement): string {
  return typeof el.customData?.query === 'string' ? el.customData.query : ''
}

export function getSearchCaptureUrl(el: ExcalidrawElement): string {
  return typeof el.customData?.url === 'string' ? el.customData.url : ''
}

export function getSearchCaptureFileId(el: ExcalidrawElement): string | null {
  return typeof el.customData?.fileId === 'string' && el.customData.fileId
    ? el.customData.fileId
    : null
}

/** Top-most search capture under scene point (later scene index wins). */
export function findPdfSearchCaptureAt(
  elements: readonly OrderedExcalidrawElement[],
  sceneX: number,
  sceneY: number
): OrderedExcalidrawElement | null {
  let hit: OrderedExcalidrawElement | null = null
  for (const el of elements) {
    if (el.isDeleted || !isPdfSearchCapture(el)) continue
    if (
      sceneX >= el.x &&
      sceneX <= el.x + el.width &&
      sceneY >= el.y &&
      sceneY <= el.y + el.height
    ) {
      hit = el
    }
  }
  return hit
}

/**
 * Excalidraw's embed "Click to interact" zone (middle third).
 * Same geometry as notes — suppress hover setState spam.
 */
export function isPdfSearchCaptureCenterHit(
  el: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  sceneX: number,
  sceneY: number
): boolean {
  return (
    sceneX >= el.x + el.width / 3 &&
    sceneX <= el.x + (2 * el.width) / 3 &&
    sceneY >= el.y + el.height / 3 &&
    sceneY <= el.y + (2 * el.height) / 3
  )
}

export const SEARCH_CAPTURE_WIDTH = 430
export const SEARCH_CAPTURE_HEIGHT = 930
/** Portrait preset (chrome resize). */
export const SEARCH_CAPTURE_PORTRAIT = { width: 430, height: 932 } as const
/** Landscape preset (chrome resize). */
export const SEARCH_CAPTURE_LANDSCAPE = { width: 1200, height: 800 } as const
/** Solid fill for Excalidraw hit-test (transparent = stroke-only). */
export const SEARCH_CAPTURE_FILL = '#e9ecef'
export const SEARCH_CAPTURE_STROKE = 'transparent'
export const SEARCH_CAPTURE_EMBED_LINK = 'libritus://pdf-search-capture'
/** Excalidraw ROUNDNESS.ADAPTIVE_RADIUS — 16px corner clip. */
export const SEARCH_CAPTURE_ROUNDNESS = { type: 3 as const, value: 16 }
const SEARCH_GAP = 48

/** Host-managed highlight→search-capture connector (no Excalidraw bindings). */
export type PdfSearchArrowData = {
  pdfSearchArrow: true
  captureId: string
  side: 'left' | 'right'
  startX: number
  startY: number
}

export function isPdfSearchArrow(el: ExcalidrawElement): boolean {
  return el.type === 'arrow' && el.customData?.pdfSearchArrow === true
}

export function googleSearchUrl(query: string): string {
  const q = query.trim()
  return `https://www.google.com/search?q=${encodeURIComponent(q || 'search')}`
}

function geomClose(
  el: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  geo: Pick<ReturnType<typeof arrowBetweenRects>, 'x' | 'y' | 'width' | 'height'>,
  eps = 0.5
): boolean {
  return (
    Math.abs(el.x - geo.x) < eps &&
    Math.abs(el.y - geo.y) < eps &&
    Math.abs(el.width - geo.width) < eps &&
    Math.abs(el.height - geo.height) < eps
  )
}

/** Highlight group union, or 1×1 at stored start when group missing. */
function searchArrowAnchor(
  elements: readonly ExcalidrawElement[],
  capture: ExcalidrawElement,
  fallback: { startX: number; startY: number }
) {
  const gid = capture.customData?.sourceHighlightId
  if (typeof gid === 'string') {
    const u = unionRect(highlightGroupMembers(elements, gid))
    if (u) return u
  }
  return { x: fallback.startX, y: fallback.startY, width: 1, height: 1 }
}

/**
 * Keep highlight→capture arrows glued without Excalidraw bindings.
 * Recomputes both ends via shortest AABB segment on each sync.
 * ponytail: one-sided bindings explode (~1e5px) when the embeddable moves.
 */
export function syncPdfSearchArrows(
  elements: readonly OrderedExcalidrawElement[]
): { elements: OrderedExcalidrawElement[]; changed: boolean } {
  const byId = new Map(elements.map((el) => [el.id, el]))
  let changed = false

  const next = elements.map((el) => {
    if (!isPdfSearchArrow(el)) return el
    const data = el.customData as PdfSearchArrowData
    const capture = byId.get(data.captureId)
    const captureAlive = !!capture && !capture.isDeleted && isPdfSearchCapture(capture)
    // Soft-delete when capture gone; revive on undo (NEVER sync isn't on undo stack).
    if (!captureAlive) {
      if (el.isDeleted) return el
      changed = true
      return newElementWith(el, { isDeleted: true } as Parameters<
        typeof newElementWith
      >[1]) as OrderedExcalidrawElement
    }
    const hl = searchArrowAnchor(elements, capture, {
      startX: data.startX,
      startY: data.startY
    })
    const geo = arrowBetweenRects(hl, capture)
    const metaOk =
      data.startX === geo.startX && data.startY === geo.startY && data.side === geo.side
    if (!el.isDeleted && geomClose(el, geo) && metaOk && el.locked) return el
    changed = true
    return newElementWith(el, {
      ...geo,
      isDeleted: false,
      locked: true,
      customData: {
        pdfSearchArrow: true,
        captureId: data.captureId,
        side: geo.side,
        startX: geo.startX,
        startY: geo.startY
      } satisfies PdfSearchArrowData
    } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
  })

  return { elements: changed ? (next as OrderedExcalidrawElement[]) : [...elements], changed }
}

/**
 * Screenshot → native Excalidraw `image` (always painted; no embedsValidationStatus).
 * Placeholder without fileId stays an embeddable.
 */
export function applySearchCaptureScreenshot(
  el: OrderedExcalidrawElement,
  patch: { fileId: string; url: string; capturedAt: string }
): OrderedExcalidrawElement {
  const customData: PdfSearchCaptureData = {
    pdfSearchCapture: true,
    query: typeof el.customData?.query === 'string' ? el.customData.query : '',
    url: patch.url,
    fileId: patch.fileId,
    capturedAt: patch.capturedAt,
    ...(typeof el.customData?.sourceHighlightId === 'string'
      ? { sourceHighlightId: el.customData.sourceHighlightId }
      : {})
  }

  return newElementWith(el, {
    type: 'image',
    fileId: patch.fileId,
    status: 'saved',
    scale: [1, 1],
    crop: null,
    link: null,
    backgroundColor: 'transparent',
    strokeColor: 'transparent',
    strokeWidth: 0,
    roundness: SEARCH_CAPTURE_ROUNDNESS,
    customData
  } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
}

/**
 * Solid fill + rectangle → embeddable placeholder (create path).
 * With fileId: promote to native `image`.
 * Prefer spread over newElementWith on hot persist path (versionNonce churn).
 */
export function normalizePdfSearchCapture(el: OrderedExcalidrawElement): OrderedExcalidrawElement {
  if (!isPdfSearchCapture(el)) return el

  const fileId = getSearchCaptureFileId(el)
  if (fileId) {
    if (
      el.type === 'image' &&
      (el as { fileId?: string | null }).fileId === fileId &&
      (el as { status?: string }).status === 'saved' &&
      el.roundness?.type === SEARCH_CAPTURE_ROUNDNESS.type &&
      el.roundness?.value === SEARCH_CAPTURE_ROUNDNESS.value
    ) {
      return el
    }
    return applySearchCaptureScreenshot(el, {
      fileId,
      url: getSearchCaptureUrl(el),
      capturedAt:
        typeof el.customData?.capturedAt === 'string'
          ? el.customData.capturedAt
          : new Date().toISOString()
    })
  }

  const fillOk = el.backgroundColor === SEARCH_CAPTURE_FILL
  const strokeOk = el.strokeColor === SEARCH_CAPTURE_STROKE && el.strokeWidth === 0

  if (el.type === 'rectangle') {
    return newElementWith(el, {
      type: 'embeddable',
      link: SEARCH_CAPTURE_EMBED_LINK,
      backgroundColor: SEARCH_CAPTURE_FILL,
      strokeColor: SEARCH_CAPTURE_STROKE,
      strokeWidth: 0
    } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
  }

  if (el.type === 'embeddable') {
    const link = el.link === SEARCH_CAPTURE_EMBED_LINK ? el.link : SEARCH_CAPTURE_EMBED_LINK
    if (link === el.link && fillOk && strokeOk) return el
    return {
      ...el,
      link,
      backgroundColor: SEARCH_CAPTURE_FILL,
      strokeColor: SEARCH_CAPTURE_STROKE,
      strokeWidth: 0
    }
  }

  return el
}

export function fixDuplicatedPdfSearchCaptures(
  nextElements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  let changed = false
  const next = nextElements.map((el) => {
    if (!isPdfSearchCapture(el) || el.isDeleted) return el
    if (el.type === 'embeddable' && el.link === SEARCH_CAPTURE_EMBED_LINK) return el
    if (el.type === 'image' && getSearchCaptureFileId(el)) return el
    changed = true
    return normalizePdfSearchCapture(el as OrderedExcalidrawElement)
  })
  return changed ? next : [...nextElements]
}

export function createSearchCapture(opts: {
  x: number
  y: number
  query: string
  url: string
  sourceHighlightId?: string
  width?: number
  height?: number
  id?: string
}): OrderedExcalidrawElement {
  const data: PdfSearchCaptureData = {
    pdfSearchCapture: true,
    query: opts.query,
    url: opts.url,
    ...(opts.sourceHighlightId ? { sourceHighlightId: opts.sourceHighlightId } : {})
  }

  const [rect] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id: opts.id ?? 'pdf-search-capture',
      x: opts.x,
      y: opts.y,
      width: opts.width ?? SEARCH_CAPTURE_WIDTH,
      height: opts.height ?? SEARCH_CAPTURE_HEIGHT,
      backgroundColor: SEARCH_CAPTURE_FILL,
      strokeColor: SEARCH_CAPTURE_STROKE,
      strokeWidth: 0,
      fillStyle: 'solid',
      roughness: 0,
      customData: data
    }
  ])

  if (!rect || rect.type !== 'rectangle') {
    throw new Error('createSearchCapture: failed to create element')
  }

  return normalizePdfSearchCapture(rect as OrderedExcalidrawElement)
}

/**
 * Search capture card + locked straight arrow from highlight edge.
 * Odd anchored artifacts go right; even go left (initial placement only).
 * Counts notes + search captures for the same highlight.
 * Arrow ends use shortest AABB segment; sync recomputes both ends on move.
 */
export function createSearchCaptureFromHighlight(
  highlight: OrderedExcalidrawElement,
  existingElements: readonly OrderedExcalidrawElement[] = []
): { newElements: OrderedExcalidrawElement[] } {
  const query =
    typeof highlight.customData?.text === 'string' ? highlight.customData.text.trim() : ''
  const url = googleSearchUrl(query)
  const groupId = highlightGroupId(highlight)
  // ponytail: same filter as createNoteFromHighlight (no shared helper — avoid cycle)
  const prior = existingElements.filter(
    (el) =>
      el.customData?.sourceHighlightId === groupId &&
      (el.customData?.pdfNote === true || el.customData?.pdfSearchCapture === true)
  ).length
  const placeSide = prior % 2 === 0 ? 'right' : 'left'

  const midY = highlight.y + highlight.height / 2
  const edgeX = placeSide === 'right' ? highlight.x + highlight.width : highlight.x
  const captureX =
    placeSide === 'right' ? edgeX + SEARCH_GAP : edgeX - SEARCH_GAP - SEARCH_CAPTURE_WIDTH
  const captureY = midY - SEARCH_CAPTURE_HEIGHT / 2

  const captureBase = createSearchCapture({
    x: captureX,
    y: captureY,
    query,
    url,
    sourceHighlightId: groupId
  })

  const geo = arrowBetweenRects(highlight, captureBase)

  const [arrow] = convertToExcalidrawElements([
    {
      type: 'arrow',
      x: geo.x,
      y: geo.y,
      width: geo.width,
      height: geo.height,
      strokeColor: '#495057',
      roughness: 0,
      locked: true
    } as ExcalidrawElementSkeleton
  ])

  if (!arrow || arrow.type !== 'arrow') {
    return { newElements: [captureBase] }
  }

  const arrowData = {
    pdfSearchArrow: true as const,
    captureId: captureBase.id,
    side: geo.side,
    startX: geo.startX,
    startY: geo.startY
  } satisfies PdfSearchArrowData

  const connector = newElementWith(arrow, {
    ...geo,
    locked: true,
    elbowed: false,
    startBinding: null,
    endBinding: null,
    customData: arrowData
  } as Parameters<typeof newElementWith>[1])

  return {
    newElements: [captureBase, connector] as OrderedExcalidrawElement[]
  }
}

/** Capture + arrow ids linked to a highlight group (for Remove cascade). */
export function searchCaptureIdsForHighlight(
  elements: readonly ExcalidrawElement[],
  groupId: string
): Set<string> {
  const ids = new Set<string>()
  const captureIds = new Set<string>()
  for (const el of elements) {
    if (el.isDeleted || !isPdfSearchCapture(el)) continue
    if (el.customData?.sourceHighlightId === groupId) {
      captureIds.add(el.id)
      ids.add(el.id)
    }
  }
  for (const el of elements) {
    if (el.isDeleted || !isPdfSearchArrow(el)) continue
    const captureId = el.customData?.captureId
    if (typeof captureId === 'string' && captureIds.has(captureId)) ids.add(el.id)
  }
  return ids
}

export function attachmentFileIdsFromSearchCaptures(
  elements: readonly ExcalidrawElement[]
): string[] {
  const ids: string[] = []
  for (const el of elements) {
    if (el.isDeleted || !isPdfSearchCapture(el)) continue
    const fileId = getSearchCaptureFileId(el)
    if (fileId) ids.push(fileId)
  }
  return ids
}
