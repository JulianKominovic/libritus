import { describe, expect, test } from 'bun:test'
import { parsePdfDate } from './pdfDates'

describe('parsePdfDate', () => {
  test('Date instance passes through', () => {
    const d = new Date('2026-01-01T00:00:00.000Z')
    expect(parsePdfDate(d)).toBe(d)
  })

  test('ISO string → Date', () => {
    const result = parsePdfDate('2026-01-01T00:00:00.000Z')
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe('2026-01-01T00:00:00.000Z')
  })

  test('invalid string → null', () => {
    expect(parsePdfDate('not-a-date')).toBeNull()
  })

  test('empty / null / undefined → null', () => {
    expect(parsePdfDate('')).toBeNull()
    expect(parsePdfDate('   ')).toBeNull()
    expect(parsePdfDate(null)).toBeNull()
    expect(parsePdfDate(undefined)).toBeNull()
  })

  test('invalid Date instance → null', () => {
    expect(parsePdfDate(new Date('nope'))).toBeNull()
  })
})
