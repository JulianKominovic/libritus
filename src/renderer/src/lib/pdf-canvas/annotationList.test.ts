import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { Value } from 'platejs'
import {
  annotationsSignature,
  canvasStatsNeedWriteback,
  countCanvasStats,
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

  test('listAnnotations sorts newest createdAt first and includes searches', () => {
    const note = baseEl({
      id: 'n1',
      type: 'embeddable',
      x: 50,
      y: 200,
      customData: {
        pdfNote: true,
        plateValue: plateValueFromQuote('quoted'),
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    })
    const hl = baseEl({
      id: 'h1',
      x: 10,
      y: 100,
      customData: {
        pdfHighlight: true,
        text: 'first highlight',
        createdAt: '2026-01-03T00:00:00.000Z'
      }
    })
    const search = baseEl({
      id: 's1',
      type: 'embeddable',
      x: 0,
      y: 0,
      customData: {
        pdfSearchCapture: true,
        query: 'web query',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    })
    const deleted = baseEl({
      id: 'gone',
      isDeleted: true,
      customData: { pdfHighlight: true, text: 'nope', createdAt: '2026-01-04T00:00:00.000Z' }
    })

    const items = listAnnotations([deleted, note, hl, search])
    expect(items.map((i) => i.id)).toEqual(['h1', 's1', 'n1'])
    expect(items[0]).toMatchObject({
      id: 'h1',
      kind: 'highlight',
      preview: 'first highlight',
      createdAt: '2026-01-03T00:00:00.000Z'
    })
    expect(items[1]).toMatchObject({ kind: 'search', preview: 'web query' })
    expect(items[2]!.kind).toBe('note')
    expect(items[2]!.plateValue).toBeDefined()
  })

  test('listAnnotations uses pageIndexAt and fileDataURL opts', () => {
    const hl = baseEl({
      id: 'h1',
      x: 10,
      y: 100,
      customData: {
        pdfHighlight: true,
        text: 'on page',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    })
    const search = baseEl({
      id: 's1',
      customData: {
        pdfSearchCapture: true,
        query: 'q',
        fileId: 'f1',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    })
    const items = listAnnotations([hl, search], {
      pageIndexAt: () => 2,
      fileDataURL: (id) => (id === 'f1' ? 'data:image/png;base64,xx' : null)
    })
    expect(items.find((i) => i.id === 'h1')?.pageIndex).toBe(2)
    expect(items.find((i) => i.id === 's1')?.fileDataURL).toBe('data:image/png;base64,xx')
  })

  test('listAnnotations legacy fallback uses capturedAt then updated', () => {
    const withCaptured = baseEl({
      id: 's1',
      customData: {
        pdfSearchCapture: true,
        query: 'old',
        capturedAt: '2026-02-01T00:00:00.000Z'
      }
    })
    const withUpdated = baseEl({
      id: 'h1',
      updated: Date.parse('2026-03-01T00:00:00.000Z'),
      customData: { pdfHighlight: true, text: 'legacy' }
    })
    const items = listAnnotations([withCaptured, withUpdated])
    expect(items.map((i) => i.id)).toEqual(['h1', 's1'])
    expect(items[0]!.createdAt).toBe('2026-03-01T00:00:00.000Z')
    expect(items[1]!.createdAt).toBe('2026-02-01T00:00:00.000Z')
  })

  test('listAnnotations and countCanvasStats dedupe by highlight groupId', () => {
    const a = baseEl({
      id: 'r1',
      x: 10,
      y: 100,
      customData: {
        pdfHighlight: true,
        text: 'multi',
        groupId: 'g1',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    })
    const b = baseEl({
      id: 'r2',
      x: 10,
      y: 120,
      customData: {
        pdfHighlight: true,
        text: 'multi',
        groupId: 'g1',
        createdAt: '2026-01-01T00:00:00.000Z'
      }
    })
    const other = baseEl({
      id: 'r3',
      x: 10,
      y: 50,
      customData: {
        pdfHighlight: true,
        text: 'solo',
        groupId: 'g2',
        createdAt: '2026-01-02T00:00:00.000Z'
      }
    })

    const items = listAnnotations([a, b, other])
    expect(items.filter((i) => i.kind === 'highlight')).toHaveLength(2)
    expect(items.map((i) => i.id)).toEqual(['r3', 'r1'])
    expect(countCanvasStats([a, b, other])).toEqual({ highlights: 2, notes: 0, searches: 0 })
  })

  test('annotationsSignature stable for same content', () => {
    const a = listAnnotations([
      baseEl({
        id: 'h',
        customData: {
          pdfHighlight: true,
          text: 'hi',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      })
    ])
    const b = listAnnotations([
      baseEl({
        id: 'h',
        x: 99,
        y: 99,
        customData: {
          pdfHighlight: true,
          text: 'hi',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      })
    ])
    expect(annotationsSignature(a)).toBe(annotationsSignature(b))
    const c = listAnnotations([
      baseEl({
        id: 'h',
        customData: {
          pdfHighlight: true,
          text: 'bye',
          createdAt: '2026-01-01T00:00:00.000Z'
        }
      })
    ])
    expect(annotationsSignature(a)).not.toBe(annotationsSignature(c))
  })

  test('countCanvasStats skips deleted and non-annotations', () => {
    expect(
      countCanvasStats([
        baseEl({ id: 'h1', customData: { pdfHighlight: true } }),
        baseEl({ id: 'h2', isDeleted: true, customData: { pdfHighlight: true } }),
        baseEl({ id: 'n1', customData: { pdfNote: true } }),
        baseEl({ id: 'n2', customData: { pdfNote: true } }),
        baseEl({ id: 's1', customData: { pdfSearchCapture: true } }),
        baseEl({ id: 's2', isDeleted: true, customData: { pdfSearchCapture: true } }),
        baseEl({ id: 'shape' })
      ])
    ).toEqual({ highlights: 1, notes: 2, searches: 1 })
    expect(countCanvasStats([])).toEqual({ highlights: 0, notes: 0, searches: 0 })
  })

  test('canvasStatsNeedWriteback treats undefined as zeros', () => {
    expect(
      canvasStatsNeedWriteback(undefined, { highlights: 0, notes: 0, searches: 0 })
    ).toBe(false)
    expect(
      canvasStatsNeedWriteback(undefined, { highlights: 1, notes: 0, searches: 0 })
    ).toBe(true)
    expect(
      canvasStatsNeedWriteback(
        { highlights: 1, notes: 2, searches: 0 },
        { highlights: 1, notes: 2, searches: 0 }
      )
    ).toBe(false)
    expect(
      canvasStatsNeedWriteback(
        { highlights: 1, notes: 0, searches: 0 },
        { highlights: 0, notes: 0, searches: 0 }
      )
    ).toBe(true)
    expect(
      canvasStatsNeedWriteback(
        { highlights: 0, notes: 0, searches: 1 },
        { highlights: 0, notes: 0, searches: 2 }
      )
    ).toBe(true)
  })
})
