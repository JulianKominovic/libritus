import { describe, expect, test } from 'bun:test'
import type { PdfDocument } from './PdfDocument'
import { loadOutline } from './pdfOutline'

function fakeDoc(proxy: {
  getOutline: () => Promise<unknown>
  getDestination?: (id: string) => Promise<unknown>
  getPageIndex?: (ref: unknown) => Promise<number>
}): PdfDocument {
  return {
    proxy,
    pageCount: 3,
    pageSizes: [],
    getPage: async () => null as never,
    destroy: async () => undefined
  } as unknown as PdfDocument
}

describe('loadOutline', () => {
  test('empty / missing outline returns []', async () => {
    expect(await loadOutline(fakeDoc({ getOutline: async () => null }))).toEqual([])
    expect(await loadOutline(fakeDoc({ getOutline: async () => [] }))).toEqual([])
    expect(
      await loadOutline(
        fakeDoc({
          getOutline: async () => {
            throw new Error('boom')
          }
        })
      )
    ).toEqual([])
  })

  test('resolves array dest and named dest; skips bad dest', async () => {
    const nodes = await loadOutline(
      fakeDoc({
        getOutline: async () => [
          {
            title: 'Chapter 1',
            dest: [{ num: 1, gen: 0 }, { name: 'XYZ' }, null, null, null],
            items: [
              {
                title: 'Section 1.1',
                dest: 'namedDest',
                items: []
              }
            ]
          },
          {
            title: 'Broken',
            dest: null,
            items: []
          }
        ],
        getDestination: async (id) => {
          if (id === 'namedDest') return [{ num: 2, gen: 0 }, { name: 'Fit' }]
          return null
        },
        getPageIndex: async (ref: unknown) => (ref as { num: number }).num - 1
      })
    )

    expect(nodes).toEqual([
      {
        title: 'Chapter 1',
        pageIndex: 0,
        children: [{ title: 'Section 1.1', pageIndex: 1, children: [] }]
      },
      { title: 'Broken', pageIndex: null, children: [] }
    ])
  })
})
