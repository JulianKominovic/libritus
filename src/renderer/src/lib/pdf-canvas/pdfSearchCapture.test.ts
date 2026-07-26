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
  SEARCH_CAPTURE_EMBED_LINK,
  SEARCH_CAPTURE_FILL,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_STROKE,
  SEARCH_CAPTURE_WIDTH,
  applySearchCaptureScreenshot,
  attachmentFileIdsFromSearchCaptures,
  createSearchCapture,
  createSearchCaptureFromHighlight,
  findPdfSearchCaptureAt,
  fixDuplicatedPdfSearchCaptures,
  getSearchCaptureFileId,
  getSearchCaptureQuery,
  getSearchCaptureUrl,
  googleSearchUrl,
  isPdfSearchArrow,
  isPdfSearchCapture,
  isPdfSearchCaptureCenterHit,
  normalizePdfSearchCapture,
  searchCaptureIdsForHighlight,
  syncPdfSearchArrows
} = await import('./pdfSearchCapture')

const SEARCH_GAP = 48

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
    customData: { pdfHighlight: true, text: 'quantum entanglement' },
    ...partial
  } as OrderedExcalidrawElement
}

describe('googleSearchUrl', () => {
  test('encodes query', () => {
    expect(googleSearchUrl('foo bar')).toBe('https://www.google.com/search?q=foo%20bar')
  })

  test('empty falls back to search', () => {
    expect(googleSearchUrl('  ')).toBe('https://www.google.com/search?q=search')
  })
})

describe('createSearchCaptureFromHighlight', () => {
  test('creates mobile-sized embeddable + host-managed arrow', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    expect(newElements).toHaveLength(2)

    const capture = newElements.find(isPdfSearchCapture)!
    const arrow = newElements.find(isPdfSearchArrow)!
    expect(capture).toBeTruthy()
    expect(arrow).toBeTruthy()

    expect(capture.width).toBe(SEARCH_CAPTURE_WIDTH)
    expect(capture.height).toBe(SEARCH_CAPTURE_HEIGHT)
    expect(capture.type).toBe('embeddable')
    expect(capture.link).toBe(SEARCH_CAPTURE_EMBED_LINK)
    expect(capture.customData?.query).toBe('quantum entanglement')
    expect(capture.customData?.url).toContain('quantum%20entanglement')
    expect(capture.customData?.sourceHighlightId).toBe('hl-1')

    expect(arrow.locked).toBe(true)
    expect(arrow.customData?.captureId).toBe(capture.id)
    expect(arrow.customData?.side).toBe('right')
    expect(capture.x).toBe(highlight.x + highlight.width + SEARCH_GAP)
  })

  test('second capture for same highlight goes left', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const first = createSearchCaptureFromHighlight(highlight).newElements
    const second = createSearchCaptureFromHighlight(highlight, first).newElements
    const capture = second.find(isPdfSearchCapture)!
    expect(capture.customData?.sourceHighlightId).toBe('hl-1')
    const arrow = second.find(isPdfSearchArrow)!
    expect(arrow.customData?.side).toBe('left')
  })

  test('capture after note for same highlight goes left', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const priorNote = {
      id: 'prior-note',
      type: 'embeddable',
      x: 0,
      y: 0,
      width: 280,
      height: 200,
      isDeleted: false,
      customData: { pdfNote: true, sourceHighlightId: 'hl-1' }
    } as OrderedExcalidrawElement
    const { newElements } = createSearchCaptureFromHighlight(highlight, [priorNote])
    const capture = newElements.find(isPdfSearchCapture)!
    const arrow = newElements.find(isPdfSearchArrow)!
    expect(arrow.customData?.side).toBe('left')
    expect(capture.x).toBe(highlight.x - SEARCH_GAP - SEARCH_CAPTURE_WIDTH)
  })
})

describe('search capture model', () => {
  test('getters read customData safely', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'hello',
      url: 'https://example.com',
      sourceHighlightId: 'hl-1'
    })
    expect(getSearchCaptureQuery(el)).toBe('hello')
    expect(getSearchCaptureUrl(el)).toBe('https://example.com')
    expect(getSearchCaptureFileId(el)).toBeNull()

    const withFile = applySearchCaptureScreenshot(el, {
      fileId: 'f1',
      url: 'https://example.com/p',
      capturedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(getSearchCaptureFileId(withFile)).toBe('f1')
  })

  test('findPdfSearchCaptureAt returns top-most', () => {
    const a = createSearchCapture({
      id: 'cap-a',
      x: 0,
      y: 0,
      query: 'a',
      url: 'https://example.com/a'
    })
    const b = {
      ...createSearchCapture({
        id: 'cap-b',
        x: 10,
        y: 10,
        query: 'b',
        url: 'https://example.com/b'
      }),
      width: 100,
      height: 100
    } as OrderedExcalidrawElement
    const hit = findPdfSearchCaptureAt([a, b], 50, 50)
    expect(hit?.id).toBe('cap-b')
    expect(findPdfSearchCaptureAt([a, b], 900, 900)).toBeNull()
  })

  test('isPdfSearchCaptureCenterHit is middle third', () => {
    const el = { x: 0, y: 0, width: 300, height: 300 }
    expect(isPdfSearchCaptureCenterHit(el, 150, 150)).toBe(true)
    expect(isPdfSearchCaptureCenterHit(el, 50, 150)).toBe(false)
    expect(isPdfSearchCaptureCenterHit(el, 150, 50)).toBe(false)
    expect(isPdfSearchCaptureCenterHit(el, 250, 250)).toBe(false)
  })
})

describe('applySearchCaptureScreenshot', () => {
  test('promotes embeddable → image preserving query + sourceHighlightId', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://example.com',
      sourceHighlightId: 'hl-1'
    })
    const next = applySearchCaptureScreenshot(el, {
      fileId: 'att-1',
      url: 'https://example.com/page',
      capturedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(next.type).toBe('image')
    expect((next as { fileId?: string }).fileId).toBe('att-1')
    expect((next as { status?: string }).status).toBe('saved')
    expect((next as { scale?: number[] }).scale).toEqual([1, 1])
    expect(next.link).toBeNull()
    expect(next.roundness?.type).toBe(3)
    expect(next.roundness?.value).toBe(16)
    expect(next.customData?.sourceHighlightId).toBe('hl-1')
    expect(next.customData?.fileId).toBe('att-1')
  })
})

describe('normalizePdfSearchCapture', () => {
  test('rectangle → embeddable with link + fill', () => {
    const rect = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://www.google.com/search?q=q'
    })
    const asRect = { ...rect, type: 'rectangle', link: null } as OrderedExcalidrawElement
    const next = normalizePdfSearchCapture(asRect)
    expect(next.type).toBe('embeddable')
    expect(next.link).toBe(SEARCH_CAPTURE_EMBED_LINK)
    expect(next.backgroundColor).toBe(SEARCH_CAPTURE_FILL)
    expect(next.strokeColor).toBe(SEARCH_CAPTURE_STROKE)
  })

  test('fileId promotes embeddable → native image', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://example.com'
    })
    const snapped = applySearchCaptureScreenshot(el, {
      fileId: 'att-1',
      url: 'https://example.com/page',
      capturedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(snapped.type).toBe('image')
    expect((snapped as { fileId?: string }).fileId).toBe('att-1')
    expect((snapped as { status?: string }).status).toBe('saved')
    expect(snapped.link).toBeNull()
    expect(snapped.customData?.fileId).toBe('att-1')

    const again = normalizePdfSearchCapture(snapped)
    expect(again).toBe(snapped)
  })

  test('image missing roundness gets adaptive corners on normalize', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://example.com'
    })
    const snapped = applySearchCaptureScreenshot(el, {
      fileId: 'att-1',
      url: 'https://example.com/page',
      capturedAt: '2026-01-01T00:00:00.000Z'
    })
    const legacy = { ...snapped, roundness: null } as OrderedExcalidrawElement
    const next = normalizePdfSearchCapture(legacy)
    expect(next).not.toBe(legacy)
    expect(next.roundness?.type).toBe(3)
    expect(next.roundness?.value).toBe(16)
  })

  test('embeddable with customData.fileId promotes to image', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://example.com'
    })
    const withFile = {
      ...el,
      type: 'embeddable',
      link: SEARCH_CAPTURE_EMBED_LINK,
      customData: {
        ...el.customData,
        fileId: 'att-2',
        capturedAt: '2026-01-01T00:00:00.000Z'
      }
    } as OrderedExcalidrawElement
    const next = normalizePdfSearchCapture(withFile)
    expect(next.type).toBe('image')
    expect((next as { fileId?: string }).fileId).toBe('att-2')
  })
})

describe('syncPdfSearchArrows', () => {
  test('moves arrow end when capture moves', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    const capture = newElements.find(isPdfSearchCapture)!
    const moved = { ...capture, x: capture.x + 80, y: capture.y + 40 } as OrderedExcalidrawElement
    const scene = newElements.map((el) => (el.id === capture.id ? moved : el))
    const { elements, changed } = syncPdfSearchArrows(scene)
    expect(changed).toBe(true)
    const arrow = elements.find(isPdfSearchArrow)!
    expect(arrow.x).toBe(arrow.customData?.startX)
    expect(arrow.width).not.toBe(0)
  })

  test('no-op when geomClose', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    const { changed } = syncPdfSearchArrows(newElements)
    expect(changed).toBe(false)
  })

  test('soft-deletes orphan arrow when capture is gone', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    const arrow = newElements.find(isPdfSearchArrow)!
    const { elements, changed } = syncPdfSearchArrows([arrow])
    expect(changed).toBe(true)
    expect(elements[0]!.isDeleted).toBe(true)
  })

  test('revives soft-deleted arrow when capture returns', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    const capture = newElements.find(isPdfSearchCapture)!
    const arrow = newElements.find(isPdfSearchArrow)!
    const deletedArrow = { ...arrow, isDeleted: true } as OrderedExcalidrawElement
    const { elements, changed } = syncPdfSearchArrows([capture, deletedArrow])
    expect(changed).toBe(true)
    const revived = elements.find(isPdfSearchArrow)!
    expect(revived.isDeleted).toBe(false)
    expect(revived.locked).toBe(true)
  })
})

describe('searchCaptureIdsForHighlight', () => {
  test('includes capture + arrow for group; skips others', () => {
    const highlight = fakeHighlight({ id: 'hl-1' })
    const { newElements } = createSearchCaptureFromHighlight(highlight)
    const other = createSearchCapture({
      id: 'other-cap',
      x: 0,
      y: 0,
      query: 'x',
      url: 'https://example.com',
      sourceHighlightId: 'other-hl'
    })
    const ids = searchCaptureIdsForHighlight([...newElements, other], 'hl-1')
    const capture = newElements.find(isPdfSearchCapture)!
    const arrow = newElements.find(isPdfSearchArrow)!
    expect(ids.has(capture.id)).toBe(true)
    expect(ids.has(arrow.id)).toBe(true)
    expect(ids.has('other-cap')).toBe(false)
  })
})

describe('attachmentFileIdsFromSearchCaptures', () => {
  test('returns only live captures with fileId', () => {
    const plain = createSearchCapture({
      x: 0,
      y: 0,
      query: 'a',
      url: 'https://example.com'
    })
    const withFile = applySearchCaptureScreenshot(
      createSearchCapture({ x: 0, y: 0, query: 'b', url: 'https://example.com' }),
      { fileId: 'att-live', url: 'https://example.com', capturedAt: '2026-01-01T00:00:00.000Z' }
    )
    const deleted = {
      ...applySearchCaptureScreenshot(
        createSearchCapture({ x: 0, y: 0, query: 'c', url: 'https://example.com' }),
        { fileId: 'att-dead', url: 'https://example.com', capturedAt: '2026-01-01T00:00:00.000Z' }
      ),
      isDeleted: true
    } as OrderedExcalidrawElement
    expect(attachmentFileIdsFromSearchCaptures([plain, withFile, deleted])).toEqual(['att-live'])
  })
})

describe('fixDuplicatedPdfSearchCaptures', () => {
  test('restores stripped embeddable link', () => {
    const el = createSearchCapture({
      x: 0,
      y: 0,
      query: 'q',
      url: 'https://example.com'
    })
    const stripped = { ...el, link: null } as OrderedExcalidrawElement
    const next = fixDuplicatedPdfSearchCaptures([stripped])
    expect(next[0].link).toBe(SEARCH_CAPTURE_EMBED_LINK)
    expect(next[0].type).toBe('embeddable')
  })
})
