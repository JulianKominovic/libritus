import { describe, expect, test } from 'bun:test'
import { mergeSameLineRects } from './mergeSameLineRects'

function fakeRect(partial: {
  left: number
  top: number
  width: number
  height: number
}): DOMRectReadOnly {
  const { left, top, width, height } = partial
  return {
    left,
    top,
    width,
    height,
    right: left + width,
    bottom: top + height,
    x: left,
    y: top,
    toJSON() {
      return {}
    }
  }
}

describe('mergeSameLineRects', () => {
  test('merges overlapping same-line rects into one', () => {
    const merged = mergeSameLineRects([
      fakeRect({ left: 0, top: 10, width: 50, height: 12 }),
      fakeRect({ left: 40, top: 11, width: 40, height: 12 })
    ])
    expect(merged.length).toBe(1)
    expect(merged[0]!.left).toBe(0)
    expect(merged[0]!.right).toBe(80)
  })

  test('keeps separate lines separate', () => {
    const merged = mergeSameLineRects([
      fakeRect({ left: 0, top: 0, width: 40, height: 12 }),
      fakeRect({ left: 0, top: 40, width: 40, height: 12 })
    ])
    expect(merged.length).toBe(2)
  })

  test('drops tiny rects', () => {
    expect(mergeSameLineRects([fakeRect({ left: 0, top: 0, width: 0.5, height: 0.5 })])).toEqual([])
  })
})
