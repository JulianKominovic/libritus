import {
  convertToExcalidrawElements,
  newElementWith
} from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/data/transform'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import {
  emptyPlateValue,
  isPdfNote,
  type PdfNoteData,
  plateValueFromQuote
} from './pdfNoteModel'

export {
  emptyPlateValue,
  findPdfNoteAt,
  getNotePlateValue,
  isPdfNote,
  type PdfNoteData,
  plateValueFromQuote,
  queryVisibleNotes
} from './pdfNoteModel'

export const NOTE_WIDTH = 280
export const NOTE_HEIGHT = 200
export const NOTE_FILL = '#fff3bf'
export const NOTE_STROKE = '#fab005'
const NOTE_GAP = 48

/** Excalidraw skips interior hit-test when fill is transparent — only the stroke receives events. */
export function ensureNoteFill(el: OrderedExcalidrawElement): OrderedExcalidrawElement {
  if (!isPdfNote(el) || el.backgroundColor !== 'transparent') return el
  return newElementWith(el, { backgroundColor: NOTE_FILL }) as OrderedExcalidrawElement
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
  const [note] = convertToExcalidrawElements([
    {
      type: 'rectangle',
      id: opts.id ?? 'pdf-note',
      x: opts.x,
      y: opts.y,
      width: opts.width ?? NOTE_WIDTH,
      height: opts.height ?? NOTE_HEIGHT,
      backgroundColor: NOTE_FILL,
      strokeColor: NOTE_STROKE,
      fillStyle: 'solid',
      roughness: 0,
      customData: {
        pdfNote: true,
        plateValue
      } satisfies PdfNoteData
    }
  ])

  if (!note || note.type !== 'rectangle') {
    throw new Error('createWysiwygNote: failed to create rectangle')
  }

  return note as OrderedExcalidrawElement
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
