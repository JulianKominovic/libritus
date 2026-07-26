import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import { highlightGroupId, isPdfHighlight } from './pdfHighlightModel'
import { getNotePlateValue, isPdfNote } from './pdfNoteModel'
import { getSearchCaptureFileId, getSearchCaptureQuery, isPdfSearchCapture } from './pdfSearchCapture'

export type AnnotationKind = 'highlight' | 'note' | 'search'

export type AnnotationListItem = {
  id: string
  kind: AnnotationKind
  createdAt: string
  preview: string
  /** 0-based page for highlights when layout is available. */
  pageIndex?: number
  plateValue?: Value
  fileDataURL?: string | null
  query?: string
}

export type ListAnnotationsOpts = {
  pageIndexAt?: (x: number, y: number) => number | null
  fileDataURL?: (fileId: string) => string | null
}

const PREVIEW_MAX = 80

/** Walk Plate Value → plain text; collapse whitespace. */
export function platePlainText(value: Value): string {
  const parts: string[] = []
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) return
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue
      const n = node as { text?: unknown; children?: unknown }
      if (typeof n.text === 'string') {
        parts.push(n.text)
      } else if (n.children) {
        walk(n.children)
      }
    }
  }
  walk(value)
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

function truncate(s: string, max = PREVIEW_MAX): string {
  if (s.length <= max) return s
  return `${s.slice(0, max - 1)}…`
}

function highlightPreview(el: ExcalidrawElement): string {
  const text = typeof el.customData?.text === 'string' ? el.customData.text.trim() : ''
  return text ? truncate(text) : 'Highlight'
}

function notePreview(el: ExcalidrawElement): string {
  const plain = platePlainText(getNotePlateValue(el))
  return plain ? truncate(plain) : 'Note'
}

function searchPreview(el: ExcalidrawElement): string {
  const query = getSearchCaptureQuery(el).trim()
  return query ? truncate(query) : 'Search'
}

/** Sort/display timestamp. Legacy: createdAt → capturedAt → el.updated. */
export function annotationCreatedAt(el: ExcalidrawElement): string {
  const cd = el.customData
  if (typeof cd?.createdAt === 'string' && cd.createdAt) return cd.createdAt
  if (typeof cd?.capturedAt === 'string' && cd.capturedAt) return cd.capturedAt
  return new Date(el.updated).toISOString()
}

/** Scene-derived annotation rows. Newest createdAt first. */
export function listAnnotations(
  elements: readonly ExcalidrawElement[],
  opts?: ListAnnotationsOpts
): AnnotationListItem[] {
  const items: AnnotationListItem[] = []
  const seenHighlightGroups = new Set<string>()

  // Sort highlights first so the representative is top-left-most per group.
  const highlights = elements
    .filter((el) => !el.isDeleted && isPdfHighlight(el))
    .slice()
    .sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))

  for (const el of highlights) {
    const gid = highlightGroupId(el)
    if (seenHighlightGroups.has(gid)) continue
    seenHighlightGroups.add(gid)
    const pageIndex = opts?.pageIndexAt?.(el.x + el.width / 2, el.y + el.height / 2) ?? undefined
    items.push({
      id: el.id,
      kind: 'highlight',
      createdAt: annotationCreatedAt(el),
      preview: highlightPreview(el),
      ...(pageIndex != null ? { pageIndex } : {})
    })
  }

  for (const el of elements) {
    if (el.isDeleted) continue
    if (isPdfNote(el)) {
      items.push({
        id: el.id,
        kind: 'note',
        createdAt: annotationCreatedAt(el),
        preview: notePreview(el),
        plateValue: getNotePlateValue(el)
      })
      continue
    }
    if (isPdfSearchCapture(el)) {
      const fileId = getSearchCaptureFileId(el)
      const fileDataURL = fileId && opts?.fileDataURL ? opts.fileDataURL(fileId) : null
      items.push({
        id: el.id,
        kind: 'search',
        createdAt: annotationCreatedAt(el),
        preview: searchPreview(el),
        query: getSearchCaptureQuery(el),
        fileDataURL
      })
    }
  }

  items.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0))
  return items
}

/** Stable signature for dirty-gating React list updates (no geometry). */
export function annotationsSignature(items: readonly AnnotationListItem[]): string {
  return items
    .map((i) => {
      const page = i.pageIndex ?? ''
      const img = i.fileDataURL ? '1' : '0'
      return `${i.id}|${i.kind}|${i.createdAt}|${i.preview}|${page}|${img}`
    })
    .join('\n')
}

export type CanvasStats = { highlights: number; notes: number; searches: number }

/** Counts for catalog writeback (category card pills). */
export function countCanvasStats(elements: readonly ExcalidrawElement[]): CanvasStats {
  const highlightGroups = new Set<string>()
  let notes = 0
  let searches = 0
  for (const el of elements) {
    if (el.isDeleted) continue
    if (isPdfHighlight(el)) highlightGroups.add(highlightGroupId(el))
    else if (isPdfNote(el)) notes++
    else if (isPdfSearchCapture(el)) searches++
  }
  return { highlights: highlightGroups.size, notes, searches }
}

/** Undefined catalog stats treated as zeros (skip write on empty open). */
export function canvasStatsNeedWriteback(
  current: CanvasStats | undefined,
  next: CanvasStats
): boolean {
  return (
    (current?.highlights ?? 0) !== next.highlights ||
    (current?.notes ?? 0) !== next.notes ||
    (current?.searches ?? 0) !== next.searches
  )
}
