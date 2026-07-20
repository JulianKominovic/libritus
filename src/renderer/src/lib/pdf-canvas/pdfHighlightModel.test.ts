import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  findPdfHighlightAt,
  highlightGroupId,
  highlightGroupMembers,
  isPdfHighlight
} from './pdfHighlightModel'

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

  test('highlightGroupId falls back to element id when missing', () => {
    const legacy = fakeHighlight({ id: 'legacy', x: 0, y: 0 })
    expect(highlightGroupId(legacy)).toBe('legacy')

    const grouped = fakeHighlight({
      id: 'r1',
      x: 0,
      y: 0,
      customData: { pdfHighlight: true, text: 'hi', groupId: 'g1' }
    })
    expect(highlightGroupId(grouped)).toBe('g1')
  })

  test('highlightGroupMembers returns live rects for a group', () => {
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
      customData: { pdfHighlight: true, text: 't', groupId: 'other' }
    })
    const deleted = fakeHighlight({
      id: 'd',
      x: 0,
      y: 60,
      isDeleted: true,
      customData: { pdfHighlight: true, text: 't', groupId: 'g' }
    })

    expect(highlightGroupMembers([a, b, other, deleted], 'g').map((el) => el.id)).toEqual([
      'a',
      'b'
    ])
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
