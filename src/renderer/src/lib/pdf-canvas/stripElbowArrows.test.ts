import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { stripElbowArrows } from './stripElbowArrows'

function arrow(
  partial: Partial<OrderedExcalidrawElement> & {
    elbowed?: boolean
    points?: readonly [number, number][]
    fixedSegments?: unknown
    startIsSpecial?: boolean | null
    endIsSpecial?: boolean | null
  }
): OrderedExcalidrawElement {
  return {
    id: 'a1',
    type: 'arrow',
    isDeleted: false,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    angle: 0,
    elbowed: false,
    points: [
      [0, 0],
      [10, 10]
    ],
    ...partial
  } as OrderedExcalidrawElement
}

describe('stripElbowArrows', () => {
  test('no-op when nothing is elbowed', () => {
    const els = [arrow({ elbowed: false }), arrow({ id: 'r1', type: 'rectangle' as never })]
    const { elements, changed } = stripElbowArrows(els)
    expect(changed).toBe(false)
    expect(elements).toEqual([...els])
  })

  test('converts elbow → sharp start/end, clears elbow fields', () => {
    const els = [
      arrow({
        elbowed: true,
        points: [
          [0, 0],
          [5, 0],
          [5, 20],
          [40, 20]
        ],
        fixedSegments: [{ index: 1 }],
        startIsSpecial: true,
        endIsSpecial: false
      })
    ]
    const { elements, changed } = stripElbowArrows(els)
    expect(changed).toBe(true)
    const a = elements[0] as {
      elbowed?: boolean
      points?: readonly [number, number][]
      width: number
      height: number
      fixedSegments?: unknown
      startIsSpecial?: boolean | null
      endIsSpecial?: boolean | null
    }
    expect(a.elbowed).toBe(false)
    expect(a.points).toEqual([
      [0, 0],
      [40, 20]
    ])
    expect(a.width).toBe(40)
    expect(a.height).toBe(20)
    expect(a.fixedSegments).toBeNull()
    expect(a.startIsSpecial).toBeNull()
    expect(a.endIsSpecial).toBeNull()
  })

  test('skips deleted elbow arrows', () => {
    const els = [arrow({ elbowed: true, isDeleted: true })]
    const { changed } = stripElbowArrows(els)
    expect(changed).toBe(false)
  })

  test('bumps versionNonce so the dirty-gate cache sees the geometry change', () => {
    const els = [arrow({ elbowed: true, versionNonce: 7 })]
    const { elements } = stripElbowArrows(els)
    expect((elements[0] as { versionNonce: number }).versionNonce).toBe(8)
  })
})
