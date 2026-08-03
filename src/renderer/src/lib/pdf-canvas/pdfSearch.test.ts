import { describe, expect, test } from 'bun:test'
import { rectFromEmbed } from './pdfSearch'

describe('rectFromEmbed', () => {
  test('maps origin/size to x/y/width/height', () => {
    expect(rectFromEmbed({ origin: { x: 1, y: 2 }, size: { width: 3, height: 4 } })).toEqual({
      x: 1,
      y: 2,
      width: 3,
      height: 4
    })
  })
})
