import { describe, expect, mock, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { NormalizedZoomValue } from '@excalidraw/excalidraw/types'

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
  HIGHLIGHT_FILL,
  normalizeHighlightColor,
  selectionToHighlightSkeletons,
  setHighlightGroupColor
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

function mockSelection(
  clientRects: Array<{
    left: number
    top: number
    right: number
    bottom: number
    width: number
    height: number
  }>,
  text = 'Libritus'
): void {
  const range = {
    getClientRects: () =>
      clientRects.map((r) => ({ ...r, x: r.left, y: r.top })) as unknown as DOMRectList
  }
  Object.defineProperty(globalThis, 'window', {
    value: {
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        toString: () => text,
        getRangeAt: () => range
      })
    },
    configurable: true,
    writable: true
  })
}

const baseAppState = {
  offsetLeft: 0,
  offsetTop: 0,
  scrollX: 0,
  scrollY: 0
}

describe('clientToSceneCoords', () => {
  test('divides by zoom and subtracts scroll', () => {
    expect(
      clientToSceneCoords(100, 50, { ...baseAppState, zoom: zoom(2), scrollX: 10, scrollY: 5 })
    ).toEqual({ x: 40, y: 20 })
  })
})

describe('selectionToHighlightSkeletons', () => {
  test('maps client rect to scene coords; zoom scales size', () => {
    mockSelection([
      {
        left: 100,
        top: 50,
        right: 200,
        bottom: 70,
        width: 100,
        height: 20
      }
    ])

    const at1 = selectionToHighlightSkeletons({
      ...baseAppState,
      zoom: zoom(1)
    })
    const at2 = selectionToHighlightSkeletons({
      ...baseAppState,
      zoom: zoom(2)
    })

    expect(at1).not.toBeNull()
    expect(at2).not.toBeNull()
    expect(at1!.length).toBe(1)
    expect(at2!.length).toBe(1)

    const a = at1![0]!
    const b = at2![0]!
    expect(a.x).toBe(100)
    expect(a.y).toBe(50)
    expect(a.width).toBe(100)
    expect(a.height).toBe(20)

    expect(b.x).toBe(50)
    expect(b.y).toBe(25)
    expect(b.width).toBe(50)
    expect(b.height).toBe(10)
    expect(b.locked).toBe(true)
    expect((b.customData as { pdfHighlight?: boolean }).pdfHighlight).toBe(true)
    expect(typeof (b.customData as { groupId?: string }).groupId).toBe('string')
  })

  test('multi-line selection stamps the same groupId on every rect', () => {
    mockSelection(
      [
        { left: 10, top: 10, right: 110, bottom: 26, width: 100, height: 16 },
        { left: 10, top: 30, right: 90, bottom: 46, width: 80, height: 16 }
      ],
      'line one\nline two'
    )

    const skeletons = selectionToHighlightSkeletons({
      ...baseAppState,
      zoom: zoom(1)
    })
    expect(skeletons).not.toBeNull()
    expect(skeletons!.length).toBe(2)
    const g0 = (skeletons![0]!.customData as { groupId: string }).groupId
    const g1 = (skeletons![1]!.customData as { groupId: string }).groupId
    expect(g0).toBe(g1)
    expect(g0.length).toBeGreaterThan(0)
  })

  test('returns null for collapsed selection', () => {
    Object.defineProperty(globalThis, 'window', {
      value: {
        getSelection: () => ({
          isCollapsed: true,
          rangeCount: 0,
          toString: () => '',
          getRangeAt: () => {
            throw new Error('none')
          }
        })
      },
      configurable: true,
      writable: true
    })
    expect(
      selectionToHighlightSkeletons({
        ...baseAppState,
        zoom: zoom(1)
      })
    ).toBeNull()
  })
})

describe('normalizeHighlightColor', () => {
  test('trims and uppercases', () => {
    expect(normalizeHighlightColor('  #ff00ff ')).toBe('#FF00FF')
  })
})

describe('setHighlightGroupColor', () => {
  test('recolors all group members; leaves others alone', () => {
    const a = fakeHighlight({
      id: 'a',
      x: 0,
      y: 0,
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    const b = fakeHighlight({
      id: 'b',
      x: 0,
      y: 20,
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })
    const other = fakeHighlight({
      id: 'c',
      x: 0,
      y: 40,
      backgroundColor: '#22D3EE',
      customData: { pdfHighlight: true, text: 't', groupId: 'other' }
    })

    const next = setHighlightGroupColor([a, b, other], 'g', '#22C55E')
    expect(next[0]!.backgroundColor).toBe('#22C55E')
    expect(next[1]!.backgroundColor).toBe('#22C55E')
    expect(next[2]!.backgroundColor).toBe('#22D3EE')
    expect(next[2]).toBe(other)
    // Undo needs a versionNonce bump — plain spread would leave fuchsia after delete→undo.
    expect(next[0]!.versionNonce).not.toBe(a.versionNonce)
    expect(next[1]!.versionNonce).not.toBe(b.versionNonce)
  })
})
