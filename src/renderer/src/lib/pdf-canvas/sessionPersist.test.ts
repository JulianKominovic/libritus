import { describe, expect, test } from 'bun:test'
import {
  combinePersistSignatures,
  elementsVersionKey,
  persistCameraSignature,
  persistElementsSignature,
  persistPlateSignature,
  persistSignature,
  shouldMarkDirty
} from './sessionPersist'

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

describe('persistElementsSignature', () => {
  test('ignores version / versionNonce / updated churn', () => {
    const a = persistElementsSignature([
      { id: 'n', link: null, version: 1, versionNonce: 111, updated: 1000 }
    ])
    const b = persistElementsSignature([
      { id: 'n', link: null, version: 9, versionNonce: 999, updated: 9999 }
    ])
    expect(a).toBe(b)
  })

  test('differs when element content changes', () => {
    const a = persistElementsSignature([{ id: 'n', link: null }])
    const b = persistElementsSignature([{ id: 'n', link: 'libritus://pdf-note' }])
    expect(a).not.toBe(b)
  })
})

describe('persistCameraSignature', () => {
  test('rounds to 3 decimals', () => {
    const a = persistCameraSignature({ scrollX: 1.23456, scrollY: 0, zoom: 1 })
    const b = persistCameraSignature({ scrollX: 1.23499, scrollY: 0, zoom: 1 })
    expect(a).toBe(b)
  })

  test('differs when camera moves', () => {
    const a = persistCameraSignature({ scrollX: 0, scrollY: 0, zoom: 1 })
    const b = persistCameraSignature({ scrollX: 10, scrollY: 0, zoom: 1 })
    expect(a).not.toBe(b)
  })
})

describe('persistPlateSignature', () => {
  test('is deterministic regardless of map insertion order', () => {
    const a = new Map([
      ['n1', 'a'],
      ['n2', 'b']
    ])
    const b = new Map([
      ['n2', 'b'],
      ['n1', 'a']
    ])
    expect(persistPlateSignature(a)).toBe(persistPlateSignature(b))
  })

  test('differs when a pending note changes', () => {
    const a = new Map([['n1', 'old']])
    const b = new Map([['n1', 'new']])
    expect(persistPlateSignature(a)).not.toBe(persistPlateSignature(b))
  })

  test('empty map is a stable constant', () => {
    expect(persistPlateSignature(new Map())).toBe(persistPlateSignature(new Map()))
  })
})

describe('combinePersistSignatures', () => {
  test('null content → null (scene unavailable)', () => {
    expect(combinePersistSignatures(null, 'p', 'c')).toBeNull()
  })

  test('each part contributes to the signature', () => {
    const base = combinePersistSignatures('e', 'p', 'c')
    expect(combinePersistSignatures('e2', 'p', 'c')).not.toBe(base)
    expect(combinePersistSignatures('e', 'p2', 'c')).not.toBe(base)
    expect(combinePersistSignatures('e', 'p', 'c2')).not.toBe(base)
  })
})

describe('elementsVersionKey', () => {
  test('changes when versionNonce bumps', () => {
    const a = elementsVersionKey([{ id: 'a', versionNonce: 1 }])
    const b = elementsVersionKey([{ id: 'a', versionNonce: 2 }])
    expect(a).not.toBe(b)
  })

  test('changes when an element is added or removed', () => {
    const one = elementsVersionKey([{ id: 'a', versionNonce: 1 }])
    const two = elementsVersionKey([
      { id: 'a', versionNonce: 1 },
      { id: 'b', versionNonce: 1 }
    ])
    expect(one).not.toBe(two)
  })

  test('stable for an unchanged scene', () => {
    const a = elementsVersionKey([
      { id: 'a', versionNonce: 1 },
      { id: 'b', versionNonce: 3 }
    ])
    const b = elementsVersionKey([
      { id: 'a', versionNonce: 1 },
      { id: 'b', versionNonce: 3 }
    ])
    expect(a).toBe(b)
  })
})

describe('shouldMarkDirty', () => {
  test('same as lastSaved while dirty → clear', () => {
    expect(shouldMarkDirty({ sig: 's1', lastSaved: 's1', pending: 's2', dirty: true })).toEqual({
      action: 'clear'
    })
  })

  test('same as lastSaved while clean → noop', () => {
    expect(shouldMarkDirty({ sig: 's1', lastSaved: 's1', pending: '', dirty: false })).toEqual({
      action: 'noop'
    })
  })

  test('same as pending while dirty → noop', () => {
    expect(shouldMarkDirty({ sig: 'p', lastSaved: 's', pending: 'p', dirty: true })).toEqual({
      action: 'noop'
    })
  })

  test('new sig → dirty', () => {
    expect(shouldMarkDirty({ sig: 'new', lastSaved: 's', pending: 'p', dirty: true })).toEqual({
      action: 'dirty',
      pending: 'new'
    })
    expect(shouldMarkDirty({ sig: 'new', lastSaved: 's', pending: '', dirty: false })).toEqual({
      action: 'dirty',
      pending: 'new'
    })
  })
})
