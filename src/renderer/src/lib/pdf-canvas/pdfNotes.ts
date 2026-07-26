import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement
} from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import {
  emptyPlateValue,
  getNotePlateValue,
  isPdfNote,
  type PdfNoteData,
  plateValueFromQuote
} from './pdfNoteModel'
import { highlightGroupId, highlightGroupMembers } from './pdfHighlightModel'
import { searchCaptureIdsForHighlight } from './pdfSearchCapture'

export {
  emptyPlateValue,
  findPdfNoteAt,
  getNotePlateValue,
  isPdfNote,
  isPdfNoteCenterHit,
  plateValueFromQuote,
  queryVisibleNotes,
  type PdfNoteData
} from './pdfNoteModel'

export const NOTE_WIDTH = 320
export const NOTE_HEIGHT = 240
/** CSS token; Excalidraw canvas can't parse var() — use resolveNoteFill(). */
export const NOTE_FILL = 'var(--color-morphing-50, #ebebeb)'
const NOTE_FILL_FALLBACK = '#ebebeb'
/** Transparent — NoteEmbed owns the visible card chrome; Excalidraw stroke was a yellow double-border. */
export const NOTE_STROKE = 'transparent'
/** Custom scheme so validateEmbeddable can whitelist our notes only. */
export const NOTE_EMBED_LINK = 'libritus://pdf-note'
const NOTE_GAP = 48

/** Host-managed highlight→note connector (no Excalidraw bindings). */
export type PdfNoteArrowData = {
  pdfNoteArrow: true
  noteId: string
  side: 'left' | 'right'
  startX: number
  startY: number
}

export function isPdfNoteArrow(el: ExcalidrawElement): boolean {
  return el.type === 'arrow' && el.customData?.pdfNoteArrow === true
}

/**
 * Highlight group rects + notes linked via sourceHighlightId + their pdfNoteArrows.
 * Used by Remove so Add-note notes/arrows don't linger as orphans.
 */
export function idsDeletedWithHighlight(
  elements: readonly ExcalidrawElement[],
  groupId: string
): Set<string> {
  const ids = new Set(highlightGroupMembers(elements, groupId).map((el) => el.id))

  const noteIds = new Set<string>()
  for (const el of elements) {
    if (el.isDeleted || !isPdfNote(el)) continue
    if (el.customData?.sourceHighlightId === groupId) {
      noteIds.add(el.id)
      ids.add(el.id)
    }
  }

  for (const el of elements) {
    if (el.isDeleted || !isPdfNoteArrow(el)) continue
    const noteId = el.customData?.noteId
    if (typeof noteId === 'string' && noteIds.has(noteId)) ids.add(el.id)
  }

  for (const id of searchCaptureIdsForHighlight(elements, groupId)) ids.add(id)

  return ids
}

function arrowGeom(
  startX: number,
  startY: number,
  note: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  side: 'left' | 'right'
): { x: number; y: number; width: number; height: number; points: [number, number][] } {
  const endX = side === 'right' ? note.x : note.x + note.width
  const endY = note.y + note.height / 2
  const width = endX - startX
  const height = endY - startY
  return {
    x: startX,
    y: startY,
    width,
    height,
    points: [
      [0, 0],
      [width, height]
    ]
  }
}

function geomClose(
  el: Pick<ExcalidrawElement, 'x' | 'y' | 'width' | 'height'>,
  geo: ReturnType<typeof arrowGeom>,
  eps = 0.5
): boolean {
  return (
    Math.abs(el.x - geo.x) < eps &&
    Math.abs(el.y - geo.y) < eps &&
    Math.abs(el.width - geo.width) < eps &&
    Math.abs(el.height - geo.height) < eps
  )
}

/**
 * Keep highlight→note arrows glued to the note without Excalidraw bindings.
 * Also migrates legacy endBinding/elbow arrows that explode on note drag.
 *
 * ponytail: Excalidraw updateBoundElements (elbow or straight) blows up one-sided
 * connectors to ~1e5px when the bound embeddable moves. Host owns geometry.
 */
export function syncPdfNoteArrows(
  elements: readonly OrderedExcalidrawElement[]
): { elements: OrderedExcalidrawElement[]; changed: boolean } {
  const byId = new Map(elements.map((el) => [el.id, el]))
  let changed = false

  // Migrate legacy bound arrows → host-managed (once).
  const migrated = elements.map((el) => {
    if (el.isDeleted || el.type !== 'arrow' || isPdfNoteArrow(el)) return el
    const endBinding = (el as { endBinding?: { elementId?: string } | null }).endBinding
    const noteId = endBinding?.elementId
    if (!noteId) return el
    const note = byId.get(noteId)
    if (!note || !isPdfNote(note) || note.isDeleted) return el

    const side: 'left' | 'right' =
      note.x + note.width / 2 < el.x + el.width / 2 ? 'left' : 'right'
    changed = true
    const geo = arrowGeom(el.x, el.y, note, side)
    return {
      ...el,
      ...geo,
      locked: true,
      elbowed: false,
      startBinding: null,
      endBinding: null,
      customData: {
        pdfNoteArrow: true,
        noteId,
        side,
        startX: el.x,
        startY: el.y
      } satisfies PdfNoteArrowData
    } as OrderedExcalidrawElement
  })

  if (changed) {
    // Drop boundElements refs to migrated arrows on notes.
    const arrowIds = new Set(
      migrated.filter((el) => isPdfNoteArrow(el) && !el.isDeleted).map((el) => el.id)
    )
    const cleared = migrated.map((el) => {
      if (!isPdfNote(el) || !el.boundElements?.length) return el
      const boundElements = el.boundElements.filter((b) => !arrowIds.has(b.id))
      if (boundElements.length === el.boundElements.length) return el
      return { ...el, boundElements: boundElements.length ? boundElements : null }
    })
    // Migration already mutated — always report changed even if geometry is a no-op.
    const synced = syncPdfNoteArrows(cleared as OrderedExcalidrawElement[])
    return { elements: synced.elements, changed: true }
  }

  const next = migrated.map((el) => {
    if (!isPdfNoteArrow(el) || el.isDeleted) return el
    const data = el.customData as PdfNoteArrowData
    const note = byId.get(data.noteId)
    if (!note || note.isDeleted || !isPdfNote(note)) return el
    const geo = arrowGeom(data.startX, data.startY, note, data.side)
    const startBinding = (el as { startBinding?: unknown }).startBinding
    const endBinding = (el as { endBinding?: unknown }).endBinding
    if (
      geomClose(el, geo) &&
      !(el as { elbowed?: boolean }).elbowed &&
      !startBinding &&
      !endBinding &&
      el.locked
    ) {
      return el
    }
    changed = true
    return {
      ...el,
      ...geo,
      locked: true,
      elbowed: false,
      startBinding: null,
      endBinding: null
    } as OrderedExcalidrawElement
  })

  return { elements: changed ? (next as OrderedExcalidrawElement[]) : [...elements], changed }
}

/** Resolved morphing-50 for canvas fill (hit-test). */
export function resolveNoteFill(): string {
  // bun:test has `document` but no getComputedStyle — treat as headless.
  if (typeof document === 'undefined' || typeof getComputedStyle === 'undefined') {
    return NOTE_FILL_FALLBACK
  }
  return (
    getComputedStyle(document.documentElement).getPropertyValue('--color-morphing-50').trim() ||
    NOTE_FILL_FALLBACK
  )
}

/**
 * Solid fill (interior hit-test) + migrate legacy rectangle notes → embeddable.
 * Call on session restore / persist.
 *
 * Prefer plain object patches over newElementWith when possible: newElementWith
 * bumps versionNonce/updated, and mapping that on every dirty-signature read
 * makes autosave debounce never settle.
 */
export function normalizePdfNote(el: OrderedExcalidrawElement): OrderedExcalidrawElement {
  if (!isPdfNote(el)) return el

  const fill = resolveNoteFill()
  const fillOk = el.backgroundColor === fill
  const strokeOk = el.strokeColor === NOTE_STROKE && el.strokeWidth === 0

  if (el.type === 'rectangle') {
    // Type change must go through newElementWith for Excalidraw's element shape.
    return newElementWith(el, {
      type: 'embeddable',
      link: NOTE_EMBED_LINK,
      backgroundColor: fill,
      strokeColor: NOTE_STROKE,
      strokeWidth: 0
    } as Parameters<typeof newElementWith>[1]) as OrderedExcalidrawElement
  }

  if (el.type === 'embeddable') {
    const link = el.link === NOTE_EMBED_LINK ? el.link : NOTE_EMBED_LINK
    if (link === el.link && fillOk && strokeOk) return el
    // ponytail: spread avoids versionNonce churn on the hot persist/signature path
    return {
      ...el,
      link,
      backgroundColor: fill,
      strokeColor: NOTE_STROKE,
      strokeWidth: 0
    }
  }

  return el
}

/**
 * Clear `link` after Excalidraw has validated the embed once.
 * Without link, Excalidraw skips the canvas link icon + open-in-new-tab hit-test.
 * Persist via normalizePdfNote so the next open can validate again.
 */
export function clearPdfNoteLinkForUi(el: OrderedExcalidrawElement): OrderedExcalidrawElement {
  if (!isPdfNote(el) || el.type !== 'embeddable' || !el.link) return el
  return newElementWith(el, { link: null } as Parameters<
    typeof newElementWith
  >[1]) as OrderedExcalidrawElement
}

type ElementBinding = {
  elementId: string
  focus: number
  gap: number
  fixedPoint?: [number, number] | null
}

function remapBinding(
  binding: ElementBinding | null | undefined,
  idMap: Map<string, string>
): ElementBinding | null | undefined {
  if (!binding || !idMap.has(binding.elementId)) return binding
  return { ...binding, elementId: idMap.get(binding.elementId)! }
}

function remapElementIds(
  el: OrderedExcalidrawElement,
  idMap: Map<string, string>
): OrderedExcalidrawElement {
  let next = el
  if (el.boundElements?.length) {
    const boundElements = el.boundElements.map((b) =>
      idMap.has(b.id) ? { ...b, id: idMap.get(b.id)! } : b
    )
    if (boundElements.some((b, i) => b.id !== el.boundElements![i]!.id)) {
      next = { ...next, boundElements }
    }
  }
  if (el.type === 'arrow' || el.type === 'line') {
    const startBinding = remapBinding(
      (el as { startBinding?: ElementBinding | null }).startBinding,
      idMap
    )
    const endBinding = remapBinding(
      (el as { endBinding?: ElementBinding | null }).endBinding,
      idMap
    )
    if (
      startBinding !== (el as { startBinding?: ElementBinding | null }).startBinding ||
      endBinding !== (el as { endBinding?: ElementBinding | null }).endBinding
    ) {
      next = { ...next, startBinding, endBinding } as OrderedExcalidrawElement
    }
  }
  if (isPdfNoteArrow(next) && typeof next.customData?.noteId === 'string') {
    const oldNoteId = next.customData.noteId
    if (idMap.has(oldNoteId)) {
      next = {
        ...next,
        customData: { ...next.customData, noteId: idMap.get(oldNoteId)! }
      }
    }
  }
  return next
}

/**
 * Restore NOTE_EMBED_LINK on duplicated/pasted notes **without changing ids**.
 * Wire to Excalidraw `onDuplicate` so the fix is part of the same undoable
 * transaction. Prefer this over repairUnvalidatedPdfNotes for paste/Cmd+D:
 * rematerializing under a fresh id via updateScene(NEVER) orphans the note
 * outside the undo stack.
 */
export function fixDuplicatedPdfNotes(
  nextElements: readonly ExcalidrawElement[]
): ExcalidrawElement[] {
  let changed = false
  const next = nextElements.map((el) => {
    if (!isPdfNote(el) || el.isDeleted) return el
    if (el.type === 'embeddable' && el.link === NOTE_EMBED_LINK) return el
    changed = true
    return normalizePdfNote(el)
  })
  return changed ? next : [...nextElements]
}

/**
 * Paste/Cmd+D of a stripped note keeps link:null. Excalidraw validates embeds once
 * per id and short-circuits on falsy URL → permanent "Empty Web-Embed". Rematerialize
 * unknown notes without NOTE_EMBED_LINK under a fresh id so validation can succeed.
 *
 * Prefer fixDuplicatedPdfNotes via onDuplicate for paste/duplicate (undo-safe).
 * This remains a safety net for paths that skip onDuplicate.
 */
export function repairUnvalidatedPdfNotes(
  elements: readonly OrderedExcalidrawElement[],
  knownIds: ReadonlySet<string>
): {
  elements: OrderedExcalidrawElement[]
  knownIds: Set<string>
  changed: boolean
} {
  const nextKnown = new Set(knownIds)
  const idMap = new Map<string, string>()

  const withNotes = elements.map((el) => {
    if (!isPdfNote(el) || el.isDeleted) return el
    if (nextKnown.has(el.id)) return el

    if (el.type === 'embeddable' && el.link === NOTE_EMBED_LINK) {
      nextKnown.add(el.id)
      return el
    }

    const freshId = crypto.randomUUID()
    idMap.set(el.id, freshId)
    nextKnown.add(freshId)
    return normalizePdfNote({ ...el, id: freshId })
  })

  if (idMap.size === 0) {
    return { elements: [...elements], knownIds: nextKnown, changed: false }
  }

  return {
    elements: withNotes.map((el) => remapElementIds(el, idMap)),
    knownIds: nextKnown,
    changed: true
  }
}

export function createWysiwygNote(opts: {
  x: number
  y: number
  width?: number
  height?: number
  plateValue?: Value
  id?: string
}): OrderedExcalidrawElement {
  const plateValue = opts.plateValue ?? emptyPlateValue()
  // convertToExcalidrawElements leaves embeddable skeletons as-is (incomplete).
  // Build a full rectangle then normalize → embeddable.
  const [rect] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id: opts.id ?? 'pdf-note',
      x: opts.x,
      y: opts.y,
      width: opts.width ?? NOTE_WIDTH,
      height: opts.height ?? NOTE_HEIGHT,
      backgroundColor: resolveNoteFill(),
      strokeColor: NOTE_STROKE,
      strokeWidth: 0,
      fillStyle: 'solid',
      roughness: 0,
      customData: {
        pdfNote: true,
        plateValue
      } satisfies PdfNoteData
    }
  ])

  if (!rect || rect.type !== 'rectangle') {
    throw new Error('createWysiwygNote: failed to create note')
  }

  return normalizePdfNote(rect as OrderedExcalidrawElement)
}

/**
 * Sticky note + locked straight arrow from highlight edge.
 * No Excalidraw bindings — host syncs geometry via syncPdfNoteArrows.
 * Odd notes (1st, 3rd…) go right; even (2nd, 4th…) go left.
 *
 * ponytail: one-sided Excalidraw bindings (elbow or straight) explode (~1e5px)
 * when the note embeddable moves. Bindings are not used.
 */
export function createNoteFromHighlight(
  highlight: OrderedExcalidrawElement,
  existingElements: readonly OrderedExcalidrawElement[] = []
): {
  newElements: OrderedExcalidrawElement[]
} {
  const quoted =
    typeof highlight.customData?.text === 'string' ? highlight.customData.text.trim() : ''

  const groupId = highlightGroupId(highlight)
  const prior = existingElements.filter(
    (el) => isPdfNote(el) && el.customData?.sourceHighlightId === groupId
  ).length
  const side = prior % 2 === 0 ? 'right' : 'left'

  const startY = highlight.y + highlight.height / 2
  const startX = side === 'right' ? highlight.x + highlight.width : highlight.x
  const noteX = side === 'right' ? startX + NOTE_GAP : startX - NOTE_GAP - NOTE_WIDTH
  const noteY = startY - NOTE_HEIGHT / 2

  const noteBase = createWysiwygNote({
    x: noteX,
    y: noteY,
    plateValue: plateValueFromQuote(quoted)
  })

  const noteData = {
    pdfNote: true as const,
    plateValue: getNotePlateValue(noteBase),
    sourceHighlightId: groupId
  } satisfies PdfNoteData

  const geo = arrowGeom(startX, startY, noteBase, side)

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
    return {
      newElements: [newElementWith(noteBase, { customData: noteData }) as OrderedExcalidrawElement]
    }
  }

  const noteArrowData = {
    pdfNoteArrow: true as const,
    noteId: noteBase.id,
    side,
    startX,
    startY
  } satisfies PdfNoteArrowData

  const connector = newElementWith(arrow, {
    ...geo,
    locked: true,
    elbowed: false,
    startBinding: null,
    endBinding: null,
    customData: noteArrowData
  } as Parameters<typeof newElementWith>[1])

  const updatedNote = newElementWith(noteBase, {
    customData: noteData
  })

  return {
    newElements: [updatedNote, connector] as OrderedExcalidrawElement[]
  }
}

export function withNotePlateValue(
  note: OrderedExcalidrawElement,
  plateValue: Value
): OrderedExcalidrawElement {
  return newElementWith(note, {
    customData: {
      ...note.customData,
      pdfNote: true,
      plateValue
    } satisfies PdfNoteData
  }) as OrderedExcalidrawElement
}
