import { describe, expect, test } from 'bun:test'
import {
  extractFromTextContent,
  findMatchesInExtracted,
  type ExtractedPage
} from './pdfSearch'

describe('extractFromTextContent', () => {
  test('builds text and page-space spans from items', () => {
    const viewport = {
      convertToViewportPoint: (x: number, y: number): [number, number] => [x, 800 - y]
    }
    const extracted = extractFromTextContent(
      [
        {
          str: 'Hello',
          dir: 'ltr',
          transform: [12, 0, 0, 12, 10, 700],
          width: 50,
          height: 12,
          fontName: 'g',
          hasEOL: false
        },
        {
          str: ' World',
          dir: 'ltr',
          transform: [12, 0, 0, 12, 60, 700],
          width: 60,
          height: 12,
          fontName: 'g',
          hasEOL: true
        },
        {
          str: 'Next',
          dir: 'ltr',
          transform: [12, 0, 0, 12, 10, 680],
          width: 40,
          height: 12,
          fontName: 'g',
          hasEOL: false
        }
      ],
      viewport
    )

    expect(extracted.text).toBe('Hello World\nNext')
    expect(extracted.spans).toHaveLength(3)
    expect(extracted.spans[0]).toEqual({
      start: 0,
      end: 5,
      rect: { x: 10, y: 800 - 700 - 12, width: 50, height: 12 }
    })
    expect(extracted.spans[1]!.start).toBe(5)
    expect(extracted.spans[1]!.end).toBe(11)
    expect(extracted.spans[2]!.start).toBe(12)
  })
})

describe('findMatchesInExtracted', () => {
  const page: ExtractedPage = {
    text: 'Libritus e2e sample',
    spans: [
      {
        start: 0,
        end: 19,
        rect: { x: 50, y: 68, width: 190, height: 24 }
      }
    ]
  }

  test('finds case-insensitive substring', () => {
    const matches = findMatchesInExtracted(0, page, 'libritus')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.pageIndex).toBe(0)
    expect(matches[0]!.rects).toHaveLength(1)
    const r = matches[0]!.rects[0]!
    expect(r.x).toBe(50)
    expect(r.y).toBe(68)
    expect(r.height).toBe(24)
    // Proportional width for 8/19 of the item
    expect(r.width).toBeCloseTo((8 / 19) * 190, 5)
  })

  test('empty / whitespace query yields nothing', () => {
    expect(findMatchesInExtracted(0, page, '')).toEqual([])
    expect(findMatchesInExtracted(0, page, '   ')).toEqual([])
  })

  test('no hit returns empty', () => {
    expect(findMatchesInExtracted(0, page, 'zzz')).toEqual([])
  })

  test('spans multiple items and merges same line', () => {
    const multi: ExtractedPage = {
      text: 'foo bar',
      spans: [
        { start: 0, end: 3, rect: { x: 0, y: 10, width: 30, height: 12 } },
        { start: 3, end: 7, rect: { x: 30, y: 10, width: 40, height: 12 } }
      ]
    }
    const matches = findMatchesInExtracted(2, multi, 'oo ba')
    expect(matches).toHaveLength(1)
    expect(matches[0]!.pageIndex).toBe(2)
    // Same line → one merged rect
    expect(matches[0]!.rects).toHaveLength(1)
    const r = matches[0]!.rects[0]!
    expect(r.x).toBeGreaterThan(0)
    expect(r.width).toBeGreaterThan(0)
  })
})
