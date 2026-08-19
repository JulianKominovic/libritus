import { describe, expect, mock, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { PDF_CONNECTOR_ROUGHNESS, PDF_CONNECTOR_STROKE_WIDTH } from './pdfHighlightModel'

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
  fixDuplicatedPdfNotes,
  idsDeletedWithHighlight,
  isPdfNoteArrow,
  normalizePdfNote,
  repairUnvalidatedPdfNotes,
  resolveNoteFill,
  syncPdfNoteArrows,
  withNotePlateValue
} = await import('./pdfNotes')
const { emptyPlateValue, isPdfNote, plateValueFromQuote } = await import('./pdfNoteModel')
const { createSearchCaptureFromHighlight, isPdfSearchArrow, isPdfSearchCapture } =
  await import('./pdfSearchCapture')

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

  test('createNoteFromHighlight: host-managed arrow, no Excalidraw bindings', () => {
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
    expect(note.boundElements).toBeFalsy()

    expect(isPdfNoteArrow(arrow)).toBe(true)
    const arrowMeta = arrow as {
      locked?: boolean
      elbowed?: boolean
      strokeColor?: string
      strokeWidth?: number
      roughness?: number
      width: number
      height: number
      startBinding?: unknown
      endBinding?: unknown
      customData?: { noteId?: string; side?: string; startX?: number; startY?: number }
    }
    expect(arrowMeta.locked).toBe(true)
    expect(arrowMeta.elbowed).toBe(false)
    expect(arrowMeta.strokeColor).toBe(highlight.backgroundColor)
    expect(arrowMeta.strokeWidth).toBe(PDF_CONNECTOR_STROKE_WIDTH)
    expect(arrowMeta.roughness).toBe(PDF_CONNECTOR_ROUGHNESS)
    expect(arrowMeta.startBinding).toBeNull()
    expect(arrowMeta.endBinding).toBeNull()
    expect(arrowMeta.customData?.noteId).toBe(note.id)
    expect(arrowMeta.customData?.side).toBe('right')
    expect(arrowMeta.customData?.startX).toBe(80)
    expect(arrowMeta.customData?.startY).toBe(10)
    expect(Math.hypot(arrowMeta.width, arrowMeta.height)).toBeLessThan(5000)
  })

  test('createNoteFromHighlight: sourceHighlightId uses groupId', () => {
    const highlight = fakeHighlight({
      id: 'rect-a',
      x: 0,
      y: 0,
      width: 80,
      height: 20,
      customData: { pdfHighlight: true, text: 'quoted text', groupId: 'group-xyz' }
    })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    expect(note.customData?.sourceHighlightId).toBe('group-xyz')
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

    const arrowMeta = arrow as {
      x: number
      locked?: boolean
      endBinding?: unknown
      customData?: { noteId?: string; side?: string }
    }
    expect(arrowMeta.x).toBe(100)
    expect(arrowMeta.locked).toBe(true)
    expect(arrowMeta.endBinding).toBeNull()
    expect(arrowMeta.customData?.noteId).toBe(note.id)
    expect(arrowMeta.customData?.side).toBe('left')
  })

  test('createNoteFromHighlight: note after search capture goes left', () => {
    const highlight = fakeHighlight({ id: 'hl-cross', x: 100, y: 0, width: 80, height: 20 })
    const prior = createSearchCaptureFromHighlight(highlight).newElements
    const { newElements } = createNoteFromHighlight(highlight, prior)
    const note = newElements.find((el) => isPdfNote(el))!
    const arrow = newElements.find((el) => isPdfNoteArrow(el))!
    expect(note.x).toBe(100 - NOTE_GAP - NOTE_WIDTH)
    expect(arrow.customData?.side).toBe('left')
  })

  test('idsDeletedWithHighlight cascades notes and arrows for groupId', () => {
    const hlA = fakeHighlight({
      id: 'rect-a',
      customData: { pdfHighlight: true, text: 'a', groupId: 'g1' }
    })
    const hlB = fakeHighlight({
      id: 'rect-b',
      y: 50,
      customData: { pdfHighlight: true, text: 'a', groupId: 'g1' }
    })
    const note1 = {
      ...createWysiwygNote({ x: 0, y: 0, id: 'note-1' }),
      customData: {
        pdfNote: true,
        plateValue: emptyPlateValue(),
        sourceHighlightId: 'g1'
      }
    } as OrderedExcalidrawElement
    const note2 = {
      ...createWysiwygNote({ x: 0, y: 0, id: 'note-2' }),
      customData: {
        pdfNote: true,
        plateValue: emptyPlateValue(),
        sourceHighlightId: 'g1'
      }
    } as OrderedExcalidrawElement
    const arrow1 = {
      ...fakeHighlight({ id: 'arr-1' }),
      type: 'arrow' as const,
      customData: {
        pdfNoteArrow: true,
        noteId: 'note-1',
        side: 'right',
        startX: 0,
        startY: 0
      }
    } as unknown as OrderedExcalidrawElement
    const arrow2 = {
      ...fakeHighlight({ id: 'arr-2' }),
      type: 'arrow' as const,
      customData: {
        pdfNoteArrow: true,
        noteId: 'note-2',
        side: 'left',
        startX: 0,
        startY: 0
      }
    } as unknown as OrderedExcalidrawElement
    const placeNote = createWysiwygNote({ x: 0, y: 0, id: 'place-note' })
    const otherHl = fakeHighlight({ id: 'other-hl', x: 500 })
    const otherNote = {
      ...createWysiwygNote({ x: 0, y: 0, id: 'other-note' }),
      customData: {
        pdfNote: true,
        plateValue: emptyPlateValue(),
        sourceHighlightId: 'other-hl'
      }
    } as OrderedExcalidrawElement
    const otherArrow = {
      ...fakeHighlight({ id: 'other-arr' }),
      type: 'arrow' as const,
      customData: {
        pdfNoteArrow: true,
        noteId: 'other-note',
        side: 'right',
        startX: 0,
        startY: 0
      }
    } as unknown as OrderedExcalidrawElement

    const searchEls = createSearchCaptureFromHighlight(
      fakeHighlight({
        id: 'g1',
        customData: { pdfHighlight: true, text: 'a', groupId: 'g1' }
      })
    ).newElements
    const searchCapture = searchEls.find(isPdfSearchCapture)!
    const searchArrow = searchEls.find(isPdfSearchArrow)!

    const scene = [
      hlA,
      hlB,
      note1,
      note2,
      arrow1,
      arrow2,
      placeNote,
      otherHl,
      otherNote,
      otherArrow,
      searchCapture,
      searchArrow
    ]
    const toDelete = idsDeletedWithHighlight(scene, 'g1')

    expect([...toDelete].sort()).toEqual(
      [
        'arr-1',
        'arr-2',
        'note-1',
        'note-2',
        'rect-a',
        'rect-b',
        searchCapture.id,
        searchArrow.id
      ].sort()
    )
    expect(toDelete.has('place-note')).toBe(false)
    expect(toDelete.has('other-hl')).toBe(false)
    expect(toDelete.has('other-note')).toBe(false)
    expect(toDelete.has('other-arr')).toBe(false)
  })

  test('syncPdfNoteArrows follows note move without exploding', () => {
    const highlight = fakeHighlight({ id: 'hl-move', x: 0, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    const movedNote = { ...note, x: note.x + 400, y: note.y + 300 }
    const { elements, changed } = syncPdfNoteArrows([highlight, movedNote, newElements[1]!])
    expect(changed).toBe(true)
    const arrow = elements.find((el) => el.type === 'arrow') as {
      width: number
      height: number
      x: number
      y: number
      customData?: { side?: string; startX?: number; startY?: number }
    }
    expect(Math.hypot(arrow.width, arrow.height)).toBeLessThan(5000)
    expect(arrow.customData?.side).toBe('right')
    // Start stays on highlight right edge (shortest AABB).
    expect(arrow.x).toBe(80)
    expect(arrow.customData?.startX).toBe(80)
    // End tracks note left edge (x); y is overlap/gap closed-form.
    expect(arrow.width).toBeCloseTo(movedNote.x - 80, 0)
  })

  test('syncPdfNoteArrows follows highlight color changes', () => {
    const highlight = fakeHighlight({ id: 'hl-color', x: 0, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    const arrow = newElements.find((el) => isPdfNoteArrow(el))!
    const recolored = { ...highlight, backgroundColor: '#22C55E' }

    const { elements, changed } = syncPdfNoteArrows([recolored, note, arrow])
    expect(changed).toBe(true)
    const nextArrow = elements.find((el) => isPdfNoteArrow(el))!
    expect(nextArrow.strokeColor).toBe('#22C55E')
    expect(nextArrow.strokeWidth).toBe(PDF_CONNECTOR_STROKE_WIDTH)
    expect(nextArrow.roughness).toBe(PDF_CONNECTOR_ROUGHNESS)
  })

  test('syncPdfNoteArrows flips to left when note crosses highlight', () => {
    const highlight = fakeHighlight({ id: 'hl-flip', x: 200, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    const arrow0 = newElements.find((el) => isPdfNoteArrow(el))!
    // Place note fully left of highlight.
    const movedNote = {
      ...note,
      x: 0,
      y: 0
    } as OrderedExcalidrawElement
    const { elements, changed } = syncPdfNoteArrows([highlight, movedNote, arrow0])
    expect(changed).toBe(true)
    const arrow = elements.find((el) => isPdfNoteArrow(el))!
    expect(arrow.customData?.side).toBe('left')
    expect(arrow.customData?.startX).toBe(200)
    expect(arrow.x).toBe(200)
    // End on note right edge.
    expect(arrow.x + arrow.width).toBeCloseTo(movedNote.x + movedNote.width, 0)
  })

  test('syncPdfNoteArrows soft-deletes orphan arrow when note is gone', () => {
    const highlight = fakeHighlight({ id: 'hl-orphan', x: 0, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    const arrow = newElements.find((el) => isPdfNoteArrow(el))!
    const { elements, changed } = syncPdfNoteArrows([arrow])
    expect(changed).toBe(true)
    expect(elements[0]!.isDeleted).toBe(true)
  })

  test('syncPdfNoteArrows revives soft-deleted arrow when note returns', () => {
    const highlight = fakeHighlight({ id: 'hl-revive', x: 0, y: 0, width: 80, height: 20 })
    const { newElements } = createNoteFromHighlight(highlight)
    const note = newElements.find((el) => isPdfNote(el))!
    const arrow = newElements.find((el) => isPdfNoteArrow(el))!
    const deletedArrow = { ...arrow, isDeleted: true } as OrderedExcalidrawElement
    const { elements, changed } = syncPdfNoteArrows([note, deletedArrow])
    expect(changed).toBe(true)
    const revived = elements.find((el) => isPdfNoteArrow(el))!
    expect(revived.isDeleted).toBe(false)
    expect(revived.locked).toBe(true)
  })

  test('syncPdfNoteArrows migrates legacy endBinding arrows', () => {
    const note = createWysiwygNote({ x: 200, y: 100, id: 'legacy-note' })
    const noteLinked = {
      ...note,
      customData: {
        ...note.customData,
        pdfNote: true as const,
        sourceHighlightId: 'hl-legacy'
      }
    } as OrderedExcalidrawElement
    const legacyArrow = {
      ...fakeHighlight({ id: 'legacy-arr', x: 80, y: 180, width: 120, height: 0 }),
      type: 'arrow' as const,
      locked: false,
      elbowed: true,
      customData: undefined,
      startBinding: null,
      endBinding: {
        elementId: noteLinked.id,
        focus: 0,
        gap: 0,
        fixedPoint: [0, 0.5] as [number, number]
      },
      boundElements: null,
      points: [
        [0, 0],
        [120, 0]
      ]
    } as unknown as OrderedExcalidrawElement
    const noteWithBound = {
      ...noteLinked,
      boundElements: [{ id: 'legacy-arr', type: 'arrow' as const }]
    } as OrderedExcalidrawElement

    const { elements, changed } = syncPdfNoteArrows([noteWithBound, legacyArrow])
    expect(changed).toBe(true)
    const arrow = elements.find((el) => el.id === 'legacy-arr')!
    const fixedNote = elements.find((el) => el.id === noteLinked.id)!
    expect(isPdfNoteArrow(arrow)).toBe(true)
    expect((arrow as { endBinding?: unknown }).endBinding).toBeNull()
    expect((arrow as { elbowed?: boolean }).elbowed).toBe(false)
    expect(fixedNote.boundElements).toBeNull()
    expect(Math.hypot(arrow.width, arrow.height)).toBeLessThan(5000)
  })

  test('syncPdfNoteArrows does not migrate endBinding without sourceHighlightId', () => {
    const note = createWysiwygNote({ x: 200, y: 100, id: 'place-note' })
    const freeArrow = {
      ...fakeHighlight({ id: 'free-arr', x: 80, y: 180, width: 120, height: 0 }),
      type: 'arrow' as const,
      locked: false,
      customData: undefined,
      startBinding: null,
      endBinding: { elementId: note.id, focus: 0, gap: 1 },
      points: [
        [0, 0],
        [120, 0]
      ]
    } as unknown as OrderedExcalidrawElement
    const { changed } = syncPdfNoteArrows([note, freeArrow])
    expect(changed).toBe(false)
  })

  test('syncPdfNoteArrows does not migrate free endBinding when host arrow already exists', () => {
    // Add note → host pdfNoteArrow; user draws a free arrow ending on the same note.
    // On reopen, migrate must not rewrite the free arrow into a second highlight→note connector.
    const base = createWysiwygNote({ x: 200, y: 100, id: 'add-note' })
    const note = {
      ...base,
      customData: {
        ...base.customData,
        pdfNote: true as const,
        sourceHighlightId: 'hl-1'
      }
    } as OrderedExcalidrawElement
    const hostArrow = {
      ...fakeHighlight({ id: 'host-arr', x: 10, y: 20, width: 190, height: 80 }),
      type: 'arrow' as const,
      locked: true,
      elbowed: false,
      customData: {
        pdfNoteArrow: true,
        noteId: note.id,
        side: 'right',
        startX: 10,
        startY: 32
      },
      startBinding: null,
      endBinding: null,
      points: [
        [0, 0],
        [190, 80]
      ]
    } as unknown as OrderedExcalidrawElement
    const freeArrow = {
      ...fakeHighlight({ id: 'free-arr', x: 50, y: 300, width: 40, height: -150 }),
      type: 'arrow' as const,
      locked: false,
      customData: undefined,
      startBinding: null,
      endBinding: { elementId: note.id, focus: 0.5, gap: 8 },
      points: [
        [0, 0],
        [40, -150]
      ]
    } as unknown as OrderedExcalidrawElement

    const { elements } = syncPdfNoteArrows([note, hostArrow, freeArrow])
    const free = elements.find((el) => el.id === 'free-arr')!
    expect(isPdfNoteArrow(free)).toBe(false)
    expect(free.x).toBe(50)
    expect(free.y).toBe(300)
    expect((free as { endBinding?: { elementId?: string } }).endBinding?.elementId).toBe(note.id)
    expect(elements.filter((el) => !el.isDeleted && isPdfNoteArrow(el)).map((el) => el.id)).toEqual(
      ['host-arr']
    )
  })

  test('syncPdfNoteArrows migrateBoundArrows:false leaves live endBinding arrow alone', () => {
    // Mid-draw: Excalidraw snaps arrow end to the note embeddable. Host must not
    // rewrite it on onChange or updateScene fights the draw → Maximum update depth.
    const note = createWysiwygNote({ x: 200, y: 100, id: 'live-note' })
    const liveArrow = {
      ...fakeHighlight({ id: 'live-arr', x: 80, y: 180, width: 40, height: 0 }),
      type: 'arrow' as const,
      locked: false,
      elbowed: false,
      customData: undefined,
      startBinding: null,
      endBinding: {
        elementId: note.id,
        focus: 0,
        gap: 1
      },
      boundElements: null,
      points: [
        [0, 0],
        [40, 0]
      ]
    } as unknown as OrderedExcalidrawElement

    const { elements, changed } = syncPdfNoteArrows([note, liveArrow], {
      migrateBoundArrows: false
    })
    expect(changed).toBe(false)
    const arrow = elements.find((el) => el.id === 'live-arr')!
    expect(isPdfNoteArrow(arrow)).toBe(false)
    expect((arrow as { endBinding?: { elementId?: string } }).endBinding?.elementId).toBe(note.id)
    expect(arrow.locked).toBe(false)
    expect(arrow.width).toBe(40)
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

  test('fixDuplicatedPdfNotes restores link and preserves id', () => {
    const note = clearPdfNoteLinkForUi(createWysiwygNote({ x: 1, y: 2, id: 'pasted' }))
    expect(note.link).toBeNull()

    const fixed = fixDuplicatedPdfNotes([note])
    expect(fixed).toHaveLength(1)
    expect(fixed[0]!.id).toBe('pasted')
    expect(fixed[0]!.link).toBe(NOTE_EMBED_LINK)
    expect(fixed[0]!.x).toBe(1)
    expect(fixed[0]!.y).toBe(2)
  })

  test('fixDuplicatedPdfNotes only touches stripped pdf notes', () => {
    const note = clearPdfNoteLinkForUi(createWysiwygNote({ x: 0, y: 0, id: 'n1' }))
    const shape = fakeHighlight({ id: 'rect-1', locked: false, customData: undefined })
    const linked = createWysiwygNote({ x: 3, y: 4, id: 'already-ok' })

    const fixed = fixDuplicatedPdfNotes([note, shape, linked])
    expect(fixed).toHaveLength(3)
    expect(fixed[0]!.id).toBe('n1')
    expect(fixed[0]!.link).toBe(NOTE_EMBED_LINK)
    expect(fixed[1]).toBe(shape)
    expect(fixed[2]).toBe(linked)
  })

  test('repairUnvalidatedPdfNotes rematerializes stripped-like unknown notes', () => {
    const note = clearPdfNoteLinkForUi(createWysiwygNote({ x: 1, y: 2, id: 'pasted' }))
    expect(note.link).toBeNull()

    const { elements, knownIds, changed } = repairUnvalidatedPdfNotes([note], new Set())
    expect(changed).toBe(true)
    expect(elements).toHaveLength(1)
    const fixed = elements[0]!
    expect(fixed.id).not.toBe('pasted')
    expect(fixed.link).toBe(NOTE_EMBED_LINK)
    expect(fixed.x).toBe(1)
    expect(fixed.y).toBe(2)
    expect(knownIds.has(fixed.id)).toBe(true)
    expect(knownIds.has('pasted')).toBe(false)
  })

  test('repairUnvalidatedPdfNotes leaves known stripped notes unchanged', () => {
    const note = clearPdfNoteLinkForUi(createWysiwygNote({ x: 0, y: 0, id: 'known' }))
    const known = new Set(['known'])
    const { elements, knownIds, changed } = repairUnvalidatedPdfNotes([note], known)
    expect(changed).toBe(false)
    expect(elements[0]).toBe(note)
    expect(elements[0]!.link).toBeNull()
    expect(knownIds.has('known')).toBe(true)
  })

  test('repairUnvalidatedPdfNotes registers new notes that already have link', () => {
    const note = createWysiwygNote({ x: 0, y: 0, id: 'fresh' })
    const { elements, knownIds, changed } = repairUnvalidatedPdfNotes([note], new Set())
    expect(changed).toBe(false)
    expect(elements[0]).toBe(note)
    expect(knownIds.has('fresh')).toBe(true)
  })

  test('repairUnvalidatedPdfNotes remaps arrow bindings to new note id', () => {
    const note = clearPdfNoteLinkForUi(createWysiwygNote({ x: 0, y: 0, id: 'old-note' }))
    const arrow = {
      ...fakeHighlight({ id: 'arr-1' }),
      type: 'arrow' as const,
      locked: false,
      customData: undefined,
      startBinding: null,
      endBinding: {
        elementId: 'old-note',
        focus: 0,
        gap: 0,
        fixedPoint: [0, 0.5] as [number, number]
      },
      boundElements: null
    } as unknown as OrderedExcalidrawElement

    const { elements, changed } = repairUnvalidatedPdfNotes([note, arrow], new Set())
    expect(changed).toBe(true)
    const fixedNote = elements.find((el) => isPdfNote(el))!
    const fixedArrow = elements.find((el) => el.id === 'arr-1') as {
      endBinding?: { elementId: string } | null
    }
    expect(fixedNote.id).not.toBe('old-note')
    expect(fixedArrow.endBinding?.elementId).toBe(fixedNote.id)
  })
})
