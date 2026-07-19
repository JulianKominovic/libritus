import { describe, expect, test } from 'bun:test'
import { persistSignature, shouldMarkDirty } from './sessionPersist'

describe('persistSignature', () => {
  test('rounds camera to 3 decimals', () => {
    const a = persistSignature([], { scrollX: 1.23456, scrollY: 0, zoom: 1 })
    const b = persistSignature([], { scrollX: 1.23499, scrollY: 0, zoom: 1 })
    expect(a).toBe(b)
  })

  test('differs when elements change', () => {
    const a = persistSignature([{ id: 'a' }], { scrollX: 0, scrollY: 0, zoom: 1 })
    const b = persistSignature([{ id: 'b' }], { scrollX: 0, scrollY: 0, zoom: 1 })
    expect(a).not.toBe(b)
  })

  test('ignores version / versionNonce / updated churn', () => {
    const cam = { scrollX: 0, scrollY: 0, zoom: 1 }
    const a = persistSignature(
      [{ id: 'n', link: null, version: 1, versionNonce: 111, updated: 1000 }],
      cam
    )
    const b = persistSignature(
      [{ id: 'n', link: null, version: 9, versionNonce: 999, updated: 9999 }],
      cam
    )
    expect(a).toBe(b)
  })
})

describe('shouldMarkDirty', () => {
  test('same as lastSaved while dirty → clear', () => {
    expect(
      shouldMarkDirty({ sig: 's1', lastSaved: 's1', pending: 's2', dirty: true })
    ).toEqual({ action: 'clear' })
  })

  test('same as lastSaved while clean → noop', () => {
    expect(
      shouldMarkDirty({ sig: 's1', lastSaved: 's1', pending: '', dirty: false })
    ).toEqual({ action: 'noop' })
  })

  test('same as pending while dirty → noop', () => {
    expect(
      shouldMarkDirty({ sig: 'p', lastSaved: 's', pending: 'p', dirty: true })
    ).toEqual({ action: 'noop' })
  })

  test('new sig → dirty', () => {
    expect(
      shouldMarkDirty({ sig: 'new', lastSaved: 's', pending: 'p', dirty: true })
    ).toEqual({ action: 'dirty', pending: 'new' })
    expect(
      shouldMarkDirty({ sig: 'new', lastSaved: 's', pending: '', dirty: false })
    ).toEqual({ action: 'dirty', pending: 'new' })
  })
})
