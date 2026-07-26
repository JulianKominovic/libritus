import { describe, expect, test } from 'bun:test'
import { arrowBetweenRects, unionRect } from './arrowBetweenRects'

describe('unionRect', () => {
  test('empty → null', () => {
    expect(unionRect([])).toBeNull()
  })

  test('single rect unchanged', () => {
    expect(unionRect([{ x: 1, y: 2, width: 3, height: 4 }])).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
  })

  test('multi-line group union', () => {
    expect(
      unionRect([
        { x: 0, y: 0, width: 80, height: 20 },
        { x: 10, y: 30, width: 60, height: 20 }
      ])
    ).toEqual({ x: 0, y: 0, width: 80, height: 50 })
  })
})

describe('arrowBetweenRects', () => {
  test('target right → highlight right edge to target left edge', () => {
    const from = { x: 0, y: 0, width: 80, height: 20 }
    const to = { x: 200, y: 0, width: 100, height: 40 }
    const geo = arrowBetweenRects(from, to)
    expect(geo.side).toBe('right')
    expect(geo.startX).toBe(80)
    expect(geo.startY).toBe(10) // mid of y-overlap [0,20]
    expect(geo.x + geo.width).toBe(200)
    expect(geo.y + geo.height).toBe(10)
  })

  test('target left → highlight left edge to target right edge', () => {
    const from = { x: 200, y: 0, width: 80, height: 20 }
    const to = { x: 0, y: 0, width: 100, height: 40 }
    const geo = arrowBetweenRects(from, to)
    expect(geo.side).toBe('left')
    expect(geo.startX).toBe(200)
    expect(geo.startY).toBe(10)
    expect(geo.x + geo.width).toBe(100)
    expect(geo.y + geo.height).toBe(10)
  })

  test('target above with x-overlap → vertical shortest segment', () => {
    const from = { x: 0, y: 100, width: 80, height: 20 }
    const to = { x: 10, y: 0, width: 60, height: 40 }
    const geo = arrowBetweenRects(from, to)
    // X overlap mid = (10+70)/2 = 40; Y: from top 100 → to bottom 40
    expect(geo.startX).toBe(40)
    expect(geo.startY).toBe(100)
    expect(geo.x + geo.width).toBe(40)
    expect(geo.y + geo.height).toBe(40)
  })

  test('diagonal separation → corner to corner', () => {
    const from = { x: 0, y: 0, width: 10, height: 10 }
    const to = { x: 30, y: 40, width: 10, height: 10 }
    const geo = arrowBetweenRects(from, to)
    expect(geo.startX).toBe(10)
    expect(geo.startY).toBe(10)
    expect(geo.x + geo.width).toBe(30)
    expect(geo.y + geo.height).toBe(40)
  })

  test('full overlap → horizontal facing by centers', () => {
    const from = { x: 0, y: 0, width: 100, height: 100 }
    const to = { x: 20, y: 20, width: 40, height: 40 }
    const geo = arrowBetweenRects(from, to)
    // to center (40) < from center (50) → left
    expect(geo.side).toBe('left')
    expect(geo.startX).toBe(0)
    expect(geo.startY).toBe(50)
    expect(geo.x + geo.width).toBe(60)
    expect(geo.y + geo.height).toBe(40)
  })
})
