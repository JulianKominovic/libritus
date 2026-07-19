import { describe, expect, mock, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

let idSeq = 0

mock.module('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (skeletons: Array<Record<string, unknown>>) =>
    skeletons.map((skel) => {
      const id = (skel.id as string | undefined) ?? `el-${++idSeq}`
      const type = skel.type as string
      return {
        id,
        type,
        x: (skel.x as number) ?? 0,
        y: (skel.y as number) ?? 0,
        width: (skel.width as number) ?? 0,
        height: (skel.height as number) ?? 0,
        angle: 0,
        strokeColor: (skel.strokeColor as string) ?? '#000',
        backgroundColor: (skel.backgroundColor as string) ?? 'transparent',
        fillStyle: (skel.fillStyle as string) ?? 'solid',
        strokeWidth: (skel.strokeWidth as number) ?? 1,
        strokeStyle: 'solid',
        roughness: (skel.roughness as number) ?? 0,
        opacity: (skel.opacity as number) ?? 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: (skel.link as string | null | undefined) ?? null,
        locked: Boolean(skel.locked),
        customData: skel.customData ?? null,
        startBinding: null,
        endBinding: null,
        points:
          type === 'arrow'
            ? [
                [0, 0],
                [(skel.width as number) ?? 0, (skel.height as number) ?? 0]
              ]
            : undefined,
        elbowed: Boolean((skel as { elbowed?: boolean }).elbowed)
      }
    }),
  newElementWith: (el: Record<string, unknown>, updates: Record<string, unknown>) => ({
    ...el,
    ...updates,
    version: ((el.version as number) ?? 1) + 1
  })
}))

const {
  NOTE_EMBED_LINK,
  NOTE_HEIGHT,
  NOTE_STROKE,
  NOTE_WIDTH,
  clearPdfNoteLinkForUi,
  createNoteFromHighlight,
  createWysiwygNote,
  normalizePdfNote,
  resolveNoteFill,
  withNotePlateValue
} = await import('./pdfNotes')
const { emptyPlateValue, isPdfNote, plateValueFromQuote } = await import('./pdfNoteModel')

const NOTE_GAP = 48

function fakeHighlight(
  partial: Partial<OrderedExcalidrawElement> & { id: string }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    x: 10,
    y: 20,
    width: 100,
    height: 24,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: '#FF00FF',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 20,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: true,
    customData: { pdfHighlight: true, text: 'quoted text' },
    ...partial
  } as OrderedExcalidrawElement
}

function legacyRectangleNote(
  partial: Partial<OrderedExcalidrawElement> & { id: string }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    x: 0,
    y: 0,
    width: NOTE_WIDTH,
    height: NOTE_HEIGHT,
    angle: 0,
    strokeColor: '#fab005',
    backgroundColor: resolveNoteFill(),
    fillStyle: 'solid',
    strokeWidth: 1,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: null,
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    customData: { pdfNote: true, plateValue: emptyPlateValue() },
    ...partial
  } as OrderedExcalidrawElement
}

describe('pdfNotes', () => {
  test('normalizePdfNote patches transparent fill and migrates rectangle → embeddable', () => {
    const legacy = legacyRectangleNote({
      id: 'n-legacy',
      backgroundColor: 'transparent'
    })
    const migrated = normalizePdfNote(legacy)
    expect(migrated.type).toBe('embeddable')
    expect(migrated.link).toBe(NOTE_EMBED_LINK)
    expect(migrated.backgroundColor).toBe(resolveNoteFill())
    expect(migrated.strokeColor).toBe(NOTE_STROKE)
    expect(migrated.strokeWidth).toBe(0)
    expect(migrated.id).toBe('n-legacy')

    const solidEmbed = createWysiwygNote({ x: 0, y: 0, id: 'n-solid' })
    expect(normalizePdfNote(solidEmbed)).toBe(solidEmbed)

    const yellowStroke = createWysiwygNote({ x: 0, y: 0, id: 'n-yellow' })
    const withYellow = {
      ...yellowStroke,
      strokeColor: '#fab005',
      strokeWidth: 1,
      backgroundColor: '#fff3bf'
    } as typeof yellowStroke
    const cleared = normalizePdfNote(withYellow)
    expect(cleared.strokeColor).toBe(NOTE_STROKE)
    expect(cleared.strokeWidth).toBe(0)
    expect(cleared.backgroundColor).toBe(resolveNoteFill())

    const highlight = fakeHighlight({ id: 'h1' })
    expect(normalizePdfNote(highlight)).toBe(highlight)
  })

  test('clearPdfNoteLinkForUi strips link; normalizePdfNote restores it', () => {
    const note = createWysiwygNote({ x: 0, y: 0, id: 'n-link' })
    expect(note.link).toBe(NOTE_EMBED_LINK)

    const cleared = clearPdfNoteLinkForUi(note)
    expect(cleared.link).toBeNull()
    expect(cleared.id).toBe(note.id)
    expect(clearPdfNoteLinkForUi(cleared)).toBe(cleared)

    const restored = normalizePdfNote(cleared)
    expect(restored.link).toBe(NOTE_EMBED_LINK)
  })

  test('createWysiwygNote sets embeddable + pdfNote identity and solid fill', () => {
    const custom = plateValueFromQuote('hi')
    const note = createWysiwygNote({
      x: 5,
      y: 7,
      id: 'note-1',
      plateValue: custom
    })
    expect(isPdfNote(note)).toBe(true)
    expect(note.type).toBe('embeddable')
    expect(note.link).toBe(NOTE_EMBED_LINK)
    expect(note.backgroundColor).toBe(resolveNoteFill())
    expect(note.strokeColor).toBe(NOTE_STROKE)
    expect(note.strokeWidth).toBe(0)
    expect(note.width).toBe(NOTE_WIDTH)
    expect(note.height).toBe(NOTE_HEIGHT)
    expect(note.x).toBe(5)
    expect(note.y).toBe(7)
    expect(JSON.stringify(note.customData?.plateValue)).toContain('hi')

    const empty = createWysiwygNote({ x: 0, y: 0 })
    expect(JSON.stringify(empty.customData?.plateValue)).toBe(JSON.stringify(emptyPlateValue()))
  })

  test('createNoteFromHighlight: elbow arrow unbound start, bound end', () => {
    const highlight = fakeHighlight({ id: 'hl-1', x: 0, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    expect(newElements.length).toBe(2)

    const note = newElements.find((el) => isPdfNote(el))!
    const arrow = newElements.find((el) => el.type === 'arrow')!
    expect(note).toBeDefined()
    expect(arrow).toBeDefined()
    expect(note.type).toBe('embeddable')

    expect(note.x).toBe(80 + NOTE_GAP)
    expect(note.y).toBe(10 - NOTE_HEIGHT / 2)
    expect(note.backgroundColor).toBe(resolveNoteFill())
    expect(JSON.stringify(note.customData?.plateValue)).toContain('quoted text')
    expect(note.customData?.sourceHighlightId).toBe('hl-1')

    const arrowBindings = arrow as {
      elbowed?: boolean
      startBinding?: { elementId: string } | null
      endBinding?: { elementId: string; fixedPoint?: [number, number] } | null
    }
    expect(arrowBindings.elbowed).toBe(true)
    expect(arrowBindings.startBinding).toBeNull()
    expect(arrowBindings.endBinding?.elementId).toBe(note.id)
    expect(arrowBindings.endBinding?.fixedPoint).toEqual([0, 0.5])
    expect(note.boundElements?.some((b) => b.id === arrow.id && b.type === 'arrow')).toBe(true)
  })

  test('createNoteFromHighlight: second note goes left', () => {
    const highlight = fakeHighlight({ id: 'hl-2', x: 100, y: 0, width: 80, height: 20 })
    const { newElements: first } = createNoteFromHighlight(highlight)
    const { newElements: second } = createNoteFromHighlight(highlight, first)

    const note = second.find((el) => isPdfNote(el))!
    const arrow = second.find((el) => el.type === 'arrow')!
    expect(note.x).toBe(100 - NOTE_GAP - NOTE_WIDTH)
    expect(note.y).toBe(10 - NOTE_HEIGHT / 2)
    expect(note.customData?.sourceHighlightId).toBe('hl-2')

    const arrowBindings = arrow as {
      x: number
      endBinding?: { elementId: string; fixedPoint?: [number, number] } | null
    }
    expect(arrowBindings.x).toBe(100)
    expect(arrowBindings.endBinding?.elementId).toBe(note.id)
    expect(arrowBindings.endBinding?.fixedPoint).toEqual([1, 0.5])
  })

  test('createNoteFromHighlight empty quote uses empty plate', () => {
    const highlight = fakeHighlight({
      id: 'hl-empty',
      customData: { pdfHighlight: true, text: '   ' }
    })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    expect(JSON.stringify(note.customData?.plateValue)).toBe(JSON.stringify(emptyPlateValue()))
  })

  test('withNotePlateValue preserves pdfNote and replaces plateValue', () => {
    const note = createWysiwygNote({ x: 0, y: 0, id: 'n1' })
    const next = withNotePlateValue(note, plateValueFromQuote('updated'))
    expect(isPdfNote(next)).toBe(true)
    expect(JSON.stringify(next.customData?.plateValue)).toContain('updated')
  })
})
