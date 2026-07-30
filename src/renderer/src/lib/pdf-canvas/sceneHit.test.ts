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
