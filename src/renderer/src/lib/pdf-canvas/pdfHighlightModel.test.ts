import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { findPdfHighlightAt, isPdfHighlight } from './pdfHighlightModel'

function fakeHighlight(
  partial: Partial<OrderedExcalidrawElement> & { id: string; x: number; y: number }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    width: 80,
    height: 16,
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
    customData: { pdfHighlight: true, text: 'hi' },
    ...partial
  } as OrderedExcalidrawElement
}

describe('pdfHighlightModel', () => {
  test('isPdfHighlight', () => {
    const hl = fakeHighlight({ id: 'h1', x: 0, y: 0 })
    expect(isPdfHighlight(hl)).toBe(true)
    expect(
      isPdfHighlight({ ...hl, customData: { pdfNote: true } } as OrderedExcalidrawElement)
    ).toBe(false)
  })

  test('findPdfHighlightAt: miss, hit, deleted skip, top-most wins', () => {
    const a = fakeHighlight({ id: 'a', x: 0, y: 0, width: 100, height: 100 })
    const b = fakeHighlight({ id: 'b', x: 20, y: 20, width: 100, height: 100 })
    const deleted = fakeHighlight({
      id: 'd',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      isDeleted: true
    })

    expect(findPdfHighlightAt([a], 500, 500)).toBeNull()
    expect(findPdfHighlightAt([a], 50, 50)?.id).toBe('a')
    expect(findPdfHighlightAt([deleted, a], 50, 50)?.id).toBe('a')
    expect(findPdfHighlightAt([a, b], 50, 50)?.id).toBe('b')
  })
})
