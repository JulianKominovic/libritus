import { describe, expect, test } from 'bun:test'
import { parseSessionSnapshot } from './sessionTypes'

describe('parseSessionSnapshot', () => {
  const valid = {
    version: 1 as const,
    docId: 'pdf-1',
    updatedAt: '2026-01-01T00:00:00.000Z',
    camera: { scrollX: 0, scrollY: -100, zoom: 1 },
    elements: [{ id: 'n1' }]
  }

  test('accepts valid snapshot', () => {
    const parsed = parseSessionSnapshot(valid)
    expect(parsed).not.toBeNull()
    expect(parsed!.docId).toBe('pdf-1')
    expect(parsed!.elements.length).toBe(1)
  })

  test('rejects wrong version', () => {
    expect(parseSessionSnapshot({ ...valid, version: 2 })).toBeNull()
  })

  test('rejects missing camera', () => {
    const { camera: _, ...rest } = valid
    expect(parseSessionSnapshot(rest)).toBeNull()
  })

  test('rejects non-array elements', () => {
    expect(parseSessionSnapshot({ ...valid, elements: {} })).toBeNull()
  })

  test('rejects null / non-object', () => {
    expect(parseSessionSnapshot(null)).toBeNull()
    expect(parseSessionSnapshot('oops')).toBeNull()
  })
})
