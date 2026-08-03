import { describe, expect, mock, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { NormalizedZoomValue } from '@excalidraw/excalidraw/types'
import type { FormattedSelection } from './selectionToHighlights'
import { PageLayout } from './PageLayout'

mock.module('@excalidraw/excalidraw', () => ({
  newElementWith: (el: OrderedExcalidrawElement, updates: Partial<OrderedExcalidrawElement>) => ({
    ...el,
    ...updates,
    version: el.version + 1,
    versionNonce: el.versionNonce + 1,
    updated: el.updated + 1
  })
}))

const {
  clientToSceneCoords,
  formattedSelectionToHighlightSkeletons,
  HIGHLIGHT_FILL,
  normalizeHighlightColor,
  setHighlightGroupColor,
  withHighlightSkeletonColor
} = await import('./selectionToHighlights')

function fakeHighlight(
  partial: Partial<OrderedExcalidrawElement> & { id: string; x: number; y: number }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    width: 80,
    height: 16,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: HIGHLIGHT_FILL,
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
    customData: { pdfHighlight: true, text: 'hi' },
    ...partial
  } as OrderedExcalidrawElement
}

const zoom = (value: number): { value: NormalizedZoomValue } => ({
  value: value as NormalizedZoomValue
})

describe('clientToSceneCoords', () => {
  test('maps client → scene with zoom and scroll', () => {
    expect(
      clientToSceneCoords(100, 50, {
        zoom: zoom(2),
        offsetLeft: 10,
        offsetTop: 5,
        scrollX: 3,
        scrollY: 1
      })
    ).toEqual({ x: (100 - 10) / 2 - 3, y: (50 - 5) / 2 - 1 })
  })
})

describe('formattedSelectionToHighlightSkeletons', () => {
  test('maps page-space segment rects into scene via layout', () => {
    const layout = new PageLayout([{ width: 100, height: 200 }], 24, 2)
    const page = layout.pages[0]!
    const formatted: FormattedSelection[] = [
      {
        pageIndex: 0,
        rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } },
        segmentRects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 8 } }]
      }
    ]
    const skeletons = formattedSelectionToHighlightSkeletons(formatted, 'hello', layout)
    expect(skeletons).toHaveLength(1)
    expect(skeletons![0]!.x).toBe(page.x + 10 * 2)
    expect(skeletons![0]!.y).toBe(page.y + 20 * 2)
    expect(skeletons![0]!.width).toBe(60)
    expect(skeletons![0]!.height).toBe(16)
    expect(skeletons![0]!.locked).toBe(true)
    expect(skeletons![0]!.customData).toMatchObject({
      pdfHighlight: true,
      text: 'hello'
    })
  })

  test('returns null for empty formatted list', () => {
    const layout = new PageLayout([{ width: 100, height: 100 }])
    expect(formattedSelectionToHighlightSkeletons([], 'hi', layout)).toBeNull()
  })

  test('allows empty text when segment rects exist', () => {
    const layout = new PageLayout([{ width: 100, height: 100 }])
    const formatted: FormattedSelection[] = [
      {
        pageIndex: 0,
        rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
        segmentRects: [{ origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } }]
      }
    ]
    const skeletons = formattedSelectionToHighlightSkeletons(formatted, '   ', layout)
    expect(skeletons).toHaveLength(1)
    expect(skeletons![0]!.customData).toMatchObject({ text: '' })
  })
})

describe('withHighlightSkeletonColor / setHighlightGroupColor', () => {
  test('withHighlightSkeletonColor recolors skeletons', () => {
    const colored = withHighlightSkeletonColor(
      [{ type: 'rectangle', x: 0, y: 0, width: 1, height: 1, backgroundColor: '#000' }],
      '#22D3EE'
    )
    expect(colored[0]!.backgroundColor).toBe('#22D3EE')
  })

  test('setHighlightGroupColor updates matching group', () => {
    const a = fakeHighlight({
      id: 'a',
      x: 0,
      y: 0,
      customData: { pdfHighlight: true, text: 't', groupId: 'g1' }
    })
    const b = fakeHighlight({
      id: 'b',
      x: 10,
      y: 0,
      customData: { pdfHighlight: true, text: 't', groupId: 'g2' }
    })
    const next = setHighlightGroupColor([a, b], 'g1', '#22C55E')
    expect(next[0]!.backgroundColor).toBe('#22C55E')
    expect(next[1]!.backgroundColor).toBe(HIGHLIGHT_FILL)
  })

  test('normalizeHighlightColor uppercases', () => {
    expect(normalizeHighlightColor(' #ff00ff ')).toBe('#FF00FF')
  })
})
