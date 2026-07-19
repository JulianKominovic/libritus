import { describe, expect, test } from 'bun:test'
import type { NormalizedZoomValue } from '@excalidraw/excalidraw/types'
import { clientToSceneCoords, selectionToHighlightSkeletons } from './selectionToHighlights'

const zoom = (value: number): { value: NormalizedZoomValue } => ({
  value: value as NormalizedZoomValue
})

function mockSelection(clientRect: {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}): void {
  const range = {
    getClientRects: () =>
      [{ ...clientRect, x: clientRect.left, y: clientRect.top }] as unknown as DOMRectList
  }
  Object.defineProperty(globalThis, 'window', {
    value: {
      getSelection: () => ({
        isCollapsed: false,
        rangeCount: 1,
        toString: () => 'Libritus',
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
    mockSelection({
      left: 100,
      top: 50,
      right: 200,
      bottom: 70,
      width: 100,
      height: 20
    })

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
