import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import { isPdfHighlight } from './pdfHighlightModel'
import { getNotePlateValue, isPdfNote } from './pdfNoteModel'

export type AnnotationKind = 'highlight' | 'note'

export type AnnotationListItem = {
  id: string
  kind: AnnotationKind
  preview: string
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

/** Scene-derived annotation rows (highlights + notes). Sort by y then x. */
export function listAnnotations(
  elements: readonly ExcalidrawElement[]
): AnnotationListItem[] {
  const items: (AnnotationListItem & { x: number; y: number })[] = []
  for (const el of elements) {
    if (el.isDeleted) continue
    if (isPdfHighlight(el)) {
      items.push({ id: el.id, kind: 'highlight', preview: highlightPreview(el), x: el.x, y: el.y })
    } else if (isPdfNote(el)) {
      items.push({ id: el.id, kind: 'note', preview: notePreview(el), x: el.x, y: el.y })
    }
  }
  items.sort((a, b) => (a.y !== b.y ? a.y - b.y : a.x - b.x))
  return items.map(({ id, kind, preview }) => ({ id, kind, preview }))
}

/** Stable signature for dirty-gating React list updates (no geometry). */
export function annotationsSignature(items: readonly AnnotationListItem[]): string {
  return items.map((i) => `${i.id}|${i.kind}|${i.preview}`).join('\n')
}

export type CanvasStats = { highlights: number; notes: number }

/** Counts for catalog writeback (category card pills). */
export function countCanvasStats(elements: readonly ExcalidrawElement[]): CanvasStats {
  let highlights = 0
  let notes = 0
  for (const el of elements) {
    if (el.isDeleted) continue
    if (isPdfHighlight(el)) highlights++
    else if (isPdfNote(el)) notes++
  }
  return { highlights, notes }
}

/** Undefined catalog stats treated as zeros (skip write on empty open). */
export function canvasStatsNeedWriteback(
  current: CanvasStats | undefined,
  next: CanvasStats
): boolean {
  return (current?.highlights ?? 0) !== next.highlights || (current?.notes ?? 0) !== next.notes
}
