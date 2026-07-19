import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import {
  annotationsSignature,
  listAnnotations,
  platePlainText
} from './annotationList'
import { emptyPlateValue, plateValueFromQuote } from './pdfNoteModel'

function baseEl(partial: Partial<OrderedExcalidrawElement> & { id: string }): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
    strokeColor: 'transparent',
    backgroundColor: '#fff',
    fillStyle: 'solid',
    strokeWidth: 0,
    strokeStyle: 'solid',
    roughness: 0,
    opacity: 100,
    groupIds: [],
    frameId: null,
    index: 'a0',
    roundness: null,
    seed: 1,
    version: 1,
    versionNonce: 1,
    isDeleted: false,
    boundElements: null,
    updated: 1,
    link: null,
    locked: false,
    ...partial
  } as OrderedExcalidrawElement
}

describe('annotationList', () => {
  test('platePlainText joins nested text and collapses whitespace', () => {
    const value: Value = [
      { type: 'p', children: [{ text: '  hello  ' }] },
      {
        type: 'p',
        children: [{ type: 'a', children: [{ text: 'world' }] }]
      }
    ]
    expect(platePlainText(value)).toBe('hello world')
    expect(platePlainText(emptyPlateValue())).toBe('')
  })

  test('listAnnotations filters, previews, sorts by y then x', () => {
    const note = baseEl({
      id: 'n1',
      type: 'embeddable',
      x: 50,
      y: 200,
      customData: { pdfNote: true, plateValue: plateValueFromQuote('quoted') }
    })
    const hlLow = baseEl({
      id: 'h1',
      x: 10,
      y: 100,
      customData: { pdfHighlight: true, text: 'first highlight' }
    })
    const hlHigh = baseEl({
      id: 'h2',
      x: 5,
      y: 50,
      customData: { pdfHighlight: true, text: '  ' }
    })
    const deleted = baseEl({
      id: 'gone',
      isDeleted: true,
      customData: { pdfHighlight: true, text: 'nope' }
    })
    const shape = baseEl({ id: 'shape', x: 0, y: 0 })

    const items = listAnnotations([deleted, note, hlLow, hlHigh, shape])
    expect(items.map((i) => i.id)).toEqual(['h2', 'h1', 'n1'])
    expect(items[0]).toEqual({ id: 'h2', kind: 'highlight', preview: 'Highlight' })
    expect(items[1]!.preview).toBe('first highlight')
    expect(items[2]!.kind).toBe('note')
    expect(items[2]!.preview).toContain('quoted')
  })

  test('annotationsSignature stable for same content', () => {
    const a = listAnnotations([
      baseEl({ id: 'h', customData: { pdfHighlight: true, text: 'hi' } })
    ])
    const b = listAnnotations([
      baseEl({ id: 'h', x: 99, y: 99, customData: { pdfHighlight: true, text: 'hi' } })
    ])
    expect(annotationsSignature(a)).toBe(annotationsSignature(b))
    const c = listAnnotations([
      baseEl({ id: 'h', customData: { pdfHighlight: true, text: 'bye' } })
    ])
    expect(annotationsSignature(a)).not.toBe(annotationsSignature(c))
  })
})
