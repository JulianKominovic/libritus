import { convertToExcalidrawElements, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import { emptyPlateValue, isPdfNote, type PdfNoteData, plateValueFromQuote } from './pdfNoteModel'

export {
  emptyPlateValue,
  findPdfNoteAt,
  getNotePlateValue,
  isPdfNote,
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

/** Resolved morphing-50 for canvas fill (hit-test). */
export function resolveNoteFill(): string {
  if (typeof document === 'undefined') return NOTE_FILL_FALLBACK
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
 * Sticky note + elbow arrow from highlight edge.
 * Start unbound (highlights are locked); end bound to the note.
 */
export function createNoteFromHighlight(highlight: OrderedExcalidrawElement): {
  newElements: OrderedExcalidrawElement[]
} {
  const quoted =
    typeof highlight.customData?.text === 'string' ? highlight.customData.text.trim() : ''

  const startX = highlight.x + highlight.width
  const startY = highlight.y + highlight.height / 2
  const noteX = startX + NOTE_GAP
  const noteY = startY - NOTE_HEIGHT / 2

  const note = createWysiwygNote({
    x: noteX,
    y: noteY,
    plateValue: plateValueFromQuote(quoted)
  })

  const endX = note.x
  const endY = note.y + note.height / 2

  const [arrow] = convertToExcalidrawElements([
    {
      type: 'arrow',
      x: startX,
      y: startY,
      width: endX - startX,
      height: endY - startY,
      strokeColor: '#495057',
      roughness: 0,
      elbowed: true
    } as ExcalidrawElementSkeleton
  ])

  if (!arrow || arrow.type !== 'arrow') {
    return { newElements: [note] }
  }

  const boundArrow = newElementWith(arrow, {
    startBinding: null,
    endBinding: {
      elementId: note.id,
      focus: 0,
      gap: 0,
      fixedPoint: [0, 0.5]
    }
  } as Parameters<typeof newElementWith>[1])

  const updatedNote = newElementWith(note, {
    boundElements: [...(note.boundElements ?? []), { id: boundArrow.id, type: 'arrow' as const }]
  })

  return {
    newElements: [updatedNote, boundArrow] as OrderedExcalidrawElement[]
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
