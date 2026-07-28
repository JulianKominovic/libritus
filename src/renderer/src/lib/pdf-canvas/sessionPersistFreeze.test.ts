import { describe, expect, test, beforeEach } from 'bun:test'
import {
  clearSessionPersistFreeze,
  freezeSessionPersist,
  isSessionPersistFrozen
} from './sessionPersistFreeze'

describe('sessionPersistFreeze', () => {
  beforeEach(() => {
    clearSessionPersistFreeze()
  })

  test('freeze blocks until cleared', () => {
    expect(isSessionPersistFrozen()).toBe(false)
    freezeSessionPersist()
    expect(isSessionPersistFrozen()).toBe(true)
    clearSessionPersistFreeze()
    expect(isSessionPersistFrozen()).toBe(false)
  })
})
