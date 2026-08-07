import { describe, expect, test } from 'bun:test'
import { en } from './en'
import { es } from './es'
import { interpolate, translate } from './translate'

describe('i18n dictionaries', () => {
  test('en and es expose identical key sets', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
  })

  test('no empty or whitespace-only values', () => {
    for (const [lang, dict] of [
      ['en', en],
      ['es', es]
    ] as const) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lang}.${key} is empty`).toBeGreaterThan(0)
      }
    }
  })
})

describe('interpolate', () => {
  test('replaces placeholders with args', () => {
    expect(interpolate('Page {page} of {total}', { page: 3, total: 42 })).toBe('Page 3 of 42')
  })

  test('keeps unknown placeholders as-is', () => {
    expect(interpolate('Hello {name}', { other: 'x' })).toBe('Hello {name}')
  })

  test('returns template unchanged without args', () => {
    expect(interpolate('Plain')).toBe('Plain')
  })
})

describe('translate', () => {
  test('returns the value for a known key', () => {
    expect(translate(en, 'home')).toBe('Home')
  })

  test('falls back to the key when missing', () => {
    expect(translate({} as typeof en, 'home' as never)).toBe('home')
  })
})
