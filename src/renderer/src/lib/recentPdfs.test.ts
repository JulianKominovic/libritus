import { describe, expect, test } from 'bun:test'
import type { Category, Pdf } from '@renderer/stores/categories'
import { recentPdfs } from './recentPdfs'

function pdf(partial: Pick<Pdf, 'id' | 'updatedAt'> & Partial<Pdf>): Pdf {
  return {
    name: partial.name ?? partial.id,
    filename: `${partial.id}.pdf`,
    src: `${partial.id}.pdf`,
    size: 1,
    createdAt: partial.updatedAt,
    pages: 1,
    thumbnail: '',
    author: '',
    hexColor: '#fff',
    creationDate: null,
    modificationDate: null,
    progress: { percentage: 0, pages: 0, offset: 0 },
    ...partial
  }
}

function category(id: string, pdfs: Pdf[]): Category {
  return {
    id,
    name: id,
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    icon: 'circle-dot',
    color: '#555',
    pdfs
  }
}

describe('recentPdfs', () => {
  test('empty categories → []', () => {
    expect(recentPdfs([])).toEqual([])
    expect(recentPdfs([category('a', [])])).toEqual([])
  })

  test('sorts by updatedAt desc across categories', () => {
    const older = pdf({ id: 'old', updatedAt: '2026-01-01T00:00:00.000Z' })
    const newer = pdf({ id: 'new', updatedAt: '2026-06-01T00:00:00.000Z' })
    const mid = pdf({ id: 'mid', updatedAt: '2026-03-01T00:00:00.000Z' })
    const c1 = category('c1', [older, mid])
    c1.name = 'Philosophy'
    const c2 = category('c2', [newer])
    c2.name = 'Fiction'
    const result = recentPdfs([c1, c2])
    expect(result.map((r) => r.pdf.id)).toEqual(['new', 'mid', 'old'])
    expect(result[0]?.categoryId).toBe('c2')
    expect(result[0]?.categoryName).toBe('Fiction')
    expect(result[1]?.categoryName).toBe('Philosophy')
  })

  test('respects limit', () => {
    const cats = [
      category('c', [
        pdf({ id: 'a', updatedAt: '2026-01-03T00:00:00.000Z' }),
        pdf({ id: 'b', updatedAt: '2026-01-02T00:00:00.000Z' }),
        pdf({ id: 'c', updatedAt: '2026-01-01T00:00:00.000Z' })
      ])
    ]
    expect(recentPdfs(cats, 2).map((r) => r.pdf.id)).toEqual(['a', 'b'])
  })

  test('same updatedAt → both present', () => {
    const t = '2026-01-01T00:00:00.000Z'
    const result = recentPdfs([
      category('c1', [pdf({ id: 'x', updatedAt: t })]),
      category('c2', [pdf({ id: 'y', updatedAt: t })])
    ])
    expect(result.map((r) => r.pdf.id).sort()).toEqual(['x', 'y'])
  })
})
