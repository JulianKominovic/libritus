import { describe, expect, test } from 'bun:test'
import { shouldApplyOpenResult } from './sessionOpen'

describe('shouldApplyOpenResult', () => {
  test('applies when not cancelled and generation matches', () => {
    expect(shouldApplyOpenResult(false, 3, 3)).toBe(true)
  })

  test('rejects cancelled open', () => {
    expect(shouldApplyOpenResult(true, 3, 3)).toBe(false)
  })

  test('rejects stale generation (rapid pdfId change)', () => {
    expect(shouldApplyOpenResult(false, 2, 3)).toBe(false)
  })
})
