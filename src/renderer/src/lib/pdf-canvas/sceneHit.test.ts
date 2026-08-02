import { describe, expect, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import { elementContainsPoint, findSceneElementAt, holdsPdfTextPassOff } from './sceneHit'

function fakeEl(
  partial: Partial<OrderedExcalidrawElement> & {
    id: string
    x: number
    y: number
    width: number
    height: number
  }
): OrderedExcalidrawElement {
  return {
    type: 'rectangle',
    angle: 0,
    strokeColor: '#000',
    backgroundColor: '#fff',
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
    ...partial
  } as OrderedExcalidrawElement
}

describe('sceneHit', () => {
  test('elementContainsPoint handles negative size', () => {
    expect(elementContainsPoint({ x: 10, y: 10, width: -8, height: -8 }, 5, 5)).toBe(true)
    expect(elementContainsPoint({ x: 10, y: 10, width: -8, height: -8 }, 0, 0)).toBe(false)
  })

  test('elementContainsPoint: linear points AABB, not positive width/height quadrant', () => {
    // Session bug: freehand arrow origin on text, points go up-left; Excalidraw
    // still stores positive width/height → naive (x,y)+(w,h) covers text below.
    const arrow = {
      x: 31.77,
      y: 3050814.5,
      width: 253.39,
      height: 268.33,
      points: [
        [0, 0],
        [-225.3, -130.08],
        [-253.39, -268.33]
      ] as const
    }
    // Phantom quadrant (down-right of origin) must miss.
    expect(elementContainsPoint(arrow, 150, 3050900)).toBe(false)
    expect(elementContainsPoint(arrow, 100, 3050976)).toBe(false)
    // True stroke AABB (up-left of origin) must hit.
    expect(elementContainsPoint(arrow, 31.77, 3050814.5)).toBe(true)
    expect(elementContainsPoint(arrow, 31.77 - 253.39, 3050814.5 - 268.33)).toBe(true)
  })

  test('elementContainsPoint: host arrow negative width via points matches size path', () => {
    const host = {
      x: 200,
      y: 100,
      width: -80,
      height: 0,
      points: [
        [0, 0],
        [-80, 0]
      ] as const
    }
    expect(elementContainsPoint(host, 160, 100)).toBe(true)
    expect(elementContainsPoint(host, 210, 100)).toBe(false)
  })

  test('elementContainsPoint: empty points falls back to width/height', () => {
    const el = { x: 0, y: 0, width: 40, height: 40, points: [] as const }
    expect(elementContainsPoint(el, 20, 20)).toBe(true)
    expect(elementContainsPoint(el, 50, 50)).toBe(false)
  })

  test('elementContainsPoint: pad expands points AABB', () => {
    const line = {
      x: 100,
      y: 100,
      width: 50,
      height: 0,
      points: [
        [0, 0],
        [50, 0]
      ] as const
    }
    expect(elementContainsPoint(line, 125, 105)).toBe(false)
    expect(elementContainsPoint(line, 125, 105, 6)).toBe(true)
  })

  test('findSceneElementAt: freehand arrow phantom quadrant does not block', () => {
    const arrow = fakeEl({
      id: 'arr',
      type: 'arrow',
      x: 31.77,
      y: 3050814.5,
      width: 253.39,
      height: 268.33,
      // Excalidraw brands LocalPoint; tuples are fine at runtime.
      points: [
        [0, 0],
        [-225.3, -130.08],
        [-253.39, -268.33]
      ] as never
    })
    expect(findSceneElementAt([arrow], 150, 3050900)).toBeNull()
    expect(findSceneElementAt([arrow], 31.77, 3050814.5)?.id).toBe('arr')
  })

  test('findSceneElementAt: miss, deleted skip, top-most wins', () => {
    const a = fakeEl({ id: 'a', x: 0, y: 0, width: 100, height: 100 })
    const b = fakeEl({ id: 'b', x: 20, y: 20, width: 100, height: 100 })
    const deleted = fakeEl({
      id: 'd',
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      isDeleted: true
    })

    expect(findSceneElementAt([a], 500, 500)).toBeNull()
    expect(findSceneElementAt([a], 50, 50)?.id).toBe('a')
    expect(findSceneElementAt([deleted, a], 50, 50)?.id).toBe('a')
    expect(findSceneElementAt([a, b], 50, 50)?.id).toBe('b')
  })

  test('findSceneElementAt: pad expands hit before the box edge', () => {
    const a = fakeEl({ id: 'a', x: 100, y: 100, width: 50, height: 50 })
    expect(findSceneElementAt([a], 95, 125)).toBeNull()
    expect(findSceneElementAt([a], 95, 125, 8)?.id).toBe('a')
  })

  test('holdsPdfTextPassOff: selection and editingLinearElement', () => {
    expect(holdsPdfTextPassOff({})).toBe(false)
    expect(holdsPdfTextPassOff({ selectedElementIds: {} })).toBe(false)
    expect(holdsPdfTextPassOff({ selectedElementIds: { a: false } })).toBe(false)
    expect(holdsPdfTextPassOff({ selectedElementIds: { a: true } })).toBe(true)
    expect(
      holdsPdfTextPassOff({
        selectedElementIds: {},
        editingLinearElement: { elementId: 'a1' }
      })
    ).toBe(true)
    expect(
      holdsPdfTextPassOff({
        selectedElementIds: null,
        editingLinearElement: { elementId: 'a1' }
      })
    ).toBe(true)
  })
})
