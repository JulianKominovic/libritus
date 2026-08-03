import { describe, expect, test } from 'bun:test'
import { PdfErrorCode } from '@embedpdf/models'
import { isPdfJobCancelled } from './isPdfJobCancelled'

describe('isPdfJobCancelled', () => {
  test('AbortException / TaskAbortedError', () => {
    expect(isPdfJobCancelled(Object.assign(new Error('x'), { name: 'AbortException' }))).toBe(true)
    expect(
      isPdfJobCancelled(
        Object.assign(new Error('x'), {
          name: 'TaskAbortedError',
          reason: { code: PdfErrorCode.Cancelled, message: 'cancelled' }
        })
      )
    ).toBe(true)
  })

  test('reason.code Cancelled without TaskAbortedError name', () => {
    expect(isPdfJobCancelled({ reason: { code: PdfErrorCode.Cancelled } })).toBe(true)
    expect(isPdfJobCancelled({ code: PdfErrorCode.Cancelled })).toBe(true)
  })

  test('other errors → false', () => {
    expect(isPdfJobCancelled(new Error('boom'))).toBe(false)
    expect(isPdfJobCancelled(null)).toBe(false)
    expect(isPdfJobCancelled({ reason: { code: PdfErrorCode.Unknown } })).toBe(false)
  })
})
