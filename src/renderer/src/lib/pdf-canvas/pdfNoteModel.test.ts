import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import {
  emptyPlateValue,
  findPdfNoteAt,
  getNotePlateValue,
  isPdfNote,
  isPdfNoteCenterHit,
  plateValueFromQuote
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
    backgroundColor: '#ebebeb',
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

  test('findPdfNoteAt: miss, hit, deleted skip, top-most wins', () => {
    const a = fakeNote({ id: 'a', x: 0, y: 0, width: 100, height: 100 })
    const b = fakeNote({ id: 'b', x: 20, y: 20, width: 100, height: 100 })
    const deleted = fakeNote({ id: 'd', x: 0, y: 0, width: 200, height: 200, isDeleted: true })

    expect(findPdfNoteAt([a], 500, 500)).toBeNull()
    expect(findPdfNoteAt([a], 50, 50)?.id).toBe('a')
    expect(findPdfNoteAt([deleted, a], 50, 50)?.id).toBe('a')
    expect(findPdfNoteAt([a, b], 50, 50)?.id).toBe('b')
  })

  test('isPdfNoteCenterHit matches Excalidraw middle third', () => {
    const note = fakeNote({ id: 'n', x: 0, y: 0, width: 300, height: 300 })
    expect(isPdfNoteCenterHit(note, 150, 150)).toBe(true)
    expect(isPdfNoteCenterHit(note, 50, 150)).toBe(false)
    expect(isPdfNoteCenterHit(note, 150, 50)).toBe(false)
    expect(isPdfNoteCenterHit(note, 100, 100)).toBe(true)
    expect(isPdfNoteCenterHit(note, 99, 100)).toBe(false)
  })
})
