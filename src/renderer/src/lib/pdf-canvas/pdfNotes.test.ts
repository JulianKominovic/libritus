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
        link: null,
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
  NOTE_FILL,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  createNoteFromHighlight,
  createWysiwygNote,
  ensureNoteFill,
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

describe('pdfNotes', () => {
  test('ensureNoteFill patches transparent notes only', () => {
    const transparent = createWysiwygNote({ x: 0, y: 0, id: 'n-transparent' })
    const patched = ensureNoteFill({
      ...transparent,
      backgroundColor: 'transparent'
    } as OrderedExcalidrawElement)
    expect(patched.backgroundColor).toBe(NOTE_FILL)

    const solid = createWysiwygNote({ x: 0, y: 0, id: 'n-solid' })
    expect(ensureNoteFill(solid)).toBe(solid)

    const highlight = fakeHighlight({ id: 'h1' })
    expect(ensureNoteFill(highlight)).toBe(highlight)
  })

  test('createWysiwygNote sets pdfNote identity and solid fill', () => {
    const custom = plateValueFromQuote('hi')
    const note = createWysiwygNote({
      x: 5,
      y: 7,
      id: 'note-1',
      plateValue: custom
    })
    expect(isPdfNote(note)).toBe(true)
    expect(note.backgroundColor).toBe(NOTE_FILL)
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

    expect(note.x).toBe(80 + NOTE_GAP)
    expect(note.y).toBe(10 - NOTE_HEIGHT / 2)
    expect(note.backgroundColor).toBe(NOTE_FILL)
    expect(JSON.stringify(note.customData?.plateValue)).toContain('quoted text')

    const arrowBindings = arrow as {
      elbowed?: boolean
      startBinding?: { elementId: string } | null
      endBinding?: { elementId: string } | null
    }
    expect(arrowBindings.elbowed).toBe(true)
    expect(arrowBindings.startBinding).toBeNull()
    expect(arrowBindings.endBinding?.elementId).toBe(note.id)
    expect(note.boundElements?.some((b) => b.id === arrow.id && b.type === 'arrow')).toBe(true)
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
