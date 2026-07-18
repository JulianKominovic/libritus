import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  emptyPlateValue,
  getNotePlateValue,
  isPdfNote,
  plateValueFromQuote,
  queryVisibleNotes
} from './pdfNoteModel'

function fakeNote(
  partial: Partial<OrderedExcalidrawElement> & { id: string; x: number; y: number }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    width: 280,
    height: 200,
    angle: 0,
    strokeColor: '#fab005',
    backgroundColor: '#fff3bf',
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
    customData: {
      pdfNote: true,
      plateValue: plateValueFromQuote('hello')
    },
    ...partial
  } as OrderedExcalidrawElement
}

describe('pdfNoteModel', () => {
  test('emptyPlateValue is one paragraph', () => {
    const empty = emptyPlateValue()
    expect(empty.length).toBe(1)
    expect(empty[0]?.type).toBe('p')
  })

  test('plateValueFromQuote', () => {
    expect(JSON.stringify(plateValueFromQuote('  hello  '))).toContain('hello')
    expect(plateValueFromQuote('   ').length).toBe(1)
  })

  test('isPdfNote', () => {
    const note = fakeNote({ id: 'n1', x: 10, y: 20 })
    expect(isPdfNote(note)).toBe(true)
    expect(
      isPdfNote({ ...note, customData: { pdfHighlight: true } } as OrderedExcalidrawElement)
    ).toBe(false)
  })

  test('getNotePlateValue', () => {
    const note = fakeNote({ id: 'n1', x: 10, y: 20 })
    expect(JSON.stringify(getNotePlateValue(note))).toContain('hello')
    expect(getNotePlateValue({ ...note, customData: {} } as OrderedExcalidrawElement).length).toBe(
      1
    )
  })

  test('queryVisibleNotes culls by AABB', () => {
    const note = fakeNote({ id: 'n1', x: 10, y: 20 })
    const outside = fakeNote({ id: 'n2', x: 500, y: 500 })
    const visible = queryVisibleNotes([note, outside], {
      minX: 0,
      minY: 0,
      maxX: 100,
      maxY: 100
    })
    expect(visible.length).toBe(1)
    expect(visible[0]?.id).toBe('n1')
  })
})
