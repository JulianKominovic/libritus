import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  caretFromSpanEdge,
  caretTargetForX,
  groupSpansIntoLines,
  isWhitespaceHit,
  lineBandForY,
  resolveSnapCaret,
  type SnapBox
} from './textLayerCaretSnap'

function box(left: number, top: number, right: number, bottom: number): SnapBox {
  return { left, top, right, bottom }
}

describe('groupSpansIntoLines / lineBandForY', () => {
  const line1 = [box(10, 10, 50, 22), box(55, 10, 100, 22)]
  const line2 = [box(10, 30, 80, 42)]
  const line3 = [box(10, 50, 90, 62)]
  const all = [...line1, ...line2, ...line3]

  test('groups into three visual lines', () => {
    const lines = groupSpansIntoLines(all)
    expect(lines).toHaveLength(3)
    expect(lines[0]).toHaveLength(2)
    expect(lines[1]).toHaveLength(1)
    expect(lines[2]).toHaveLength(1)
  })

  test('picks closest line by Y mid', () => {
    expect(lineBandForY(all, 36)).toEqual(line2)
    expect(lineBandForY(all, 55)).toEqual(line3)
    // mid line1=16, mid line2=36; y=26 ties (dist 10) — keep first (`<` only)
    expect(lineBandForY(all, 26)).toEqual(line1)
  })

  test('returns null for empty', () => {
    expect(lineBandForY([], 0)).toBeNull()
  })
})

describe('caretTargetForX', () => {
  const line = [box(10, 10, 40, 20), box(50, 10, 90, 20)]

  test('X left of line → start of first span', () => {
    expect(caretTargetForX(line, 0)).toEqual({ index: 0, edge: 'start' })
  })

  test('X right of line → end of last span', () => {
    expect(caretTargetForX(line, 200)).toEqual({ index: 1, edge: 'end' })
  })

  test('X in gap → nearest span edge', () => {
    expect(caretTargetForX(line, 42)).toEqual({ index: 0, edge: 'end' })
    expect(caretTargetForX(line, 48)).toEqual({ index: 1, edge: 'start' })
  })

  test('empty → null', () => {
    expect(caretTargetForX([], 10)).toBeNull()
  })
})

describe('isWhitespaceHit', () => {
  test('endOfContent and textLayer are whitespace; text span is not', () => {
    const layer: {
      classList: { contains: (c: string) => boolean }
      closest: (sel: string) => unknown
      textContent?: string
    } = {
      classList: { contains: (c) => c === 'textLayer' },
      closest(sel) {
        return sel === '.textLayer' ? layer : null
      }
    }
    const end = {
      classList: { contains: (c: string) => c === 'endOfContent' },
      closest(sel: string) {
        if (sel === '.textLayer') return layer
        if (sel === '.textLayer span') return null
        return null
      }
    }
    const span = {
      classList: { contains: () => false },
      textContent: 'hello',
      closest(sel: string) {
        if (sel === '.textLayer') return layer
        if (sel === '.textLayer span') return span
        return null
      }
    }
    const emptySpan = {
      classList: { contains: () => false },
      textContent: '',
      closest(sel: string) {
        if (sel === '.textLayer') return layer
        if (sel === '.textLayer span') return emptySpan
        return null
      }
    }

    expect(isWhitespaceHit(end as unknown as EventTarget)).toBe(true)
    expect(isWhitespaceHit(layer as unknown as EventTarget)).toBe(true)
    expect(isWhitespaceHit(span as unknown as EventTarget)).toBe(false)
    expect(isWhitespaceHit(emptySpan as unknown as EventTarget)).toBe(true)
    expect(isWhitespaceHit(null)).toBe(false)
    expect(isWhitespaceHit({} as EventTarget)).toBe(false)
  })
})

describe('caretFromSpanEdge / resolveSnapCaret', () => {
  function withDom<T>(fn: (doc: Document) => T): T {
    const dom = new JSDOM('<!doctype html><body></body>')
    const prevNode = (globalThis as { Node?: unknown }).Node
    Object.defineProperty(globalThis, 'Node', {
      value: dom.window.Node,
      configurable: true
    })
    try {
      return fn(dom.window.document)
    } finally {
      Object.defineProperty(globalThis, 'Node', {
        value: prevNode,
        configurable: true
      })
    }
  }

  function rect(x: number, y: number, w: number, h: number): DOMRect {
    return {
      x,
      y,
      width: w,
      height: h,
      left: x,
      top: y,
      right: x + w,
      bottom: y + h,
      toJSON() {
        return {}
      }
    } as DOMRect
  }

  test('caretFromSpanEdge start/end on text node', () => {
    withDom((doc) => {
      const span = doc.createElement('span')
      span.textContent = 'Hello'
      doc.body.append(span)

      const start = caretFromSpanEdge(span, 'start')
      expect(start?.offset).toBe(0)
      expect(start?.node.textContent).toBe('Hello')

      const end = caretFromSpanEdge(span, 'end')
      expect(end?.offset).toBe(5)
      expect(end?.node).toBe(start?.node)
    })
  })

  test('resolveSnapCaret: X left of line → start; X right → end', () => {
    withDom((doc) => {
      const layer = doc.createElement('div')
      layer.className = 'textLayer'
      const span = doc.createElement('span')
      span.textContent = 'Libritus'
      span.getBoundingClientRect = () => rect(100, 50, 80, 16)
      layer.append(span)
      doc.body.append(layer)

      const left = resolveSnapCaret(layer, 40, 58)
      expect(left?.offset).toBe(0)
      expect(span.contains(left!.node)).toBe(true)

      const right = resolveSnapCaret(layer, 220, 58)
      expect(right?.offset).toBe('Libritus'.length)
      expect(span.contains(right!.node)).toBe(true)
    })
  })
})
