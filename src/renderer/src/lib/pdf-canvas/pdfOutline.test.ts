import { describe, expect, test } from 'bun:test'
import type { PdfDocument } from './PdfDocument'
import {
  flattenOutline,
  loadOutline,
  mapBookmark,
  pageIndexFromBookmarkTarget,
  type OutlineNode
} from './pdfOutline'
import type { PdfBookmarkObject, PdfTask } from '@embedpdf/models'

function resolveTask<T>(value: T): PdfTask<T> {
  return {
    toPromise: async () => value,
    wait: (ok: (v: T) => void) => ok(value),
    abort: () => undefined,
    onProgress: () => undefined
  } as unknown as PdfTask<T>
}

function fakeDoc(bookmarks: PdfBookmarkObject[] | (() => never)): PdfDocument {
  return {
    handle: { id: 'x', pageCount: 3, pages: [] },
    engine: {
      getBookmarks: () => {
        if (typeof bookmarks === 'function') {
          throw new Error('boom')
        }
        return resolveTask({ bookmarks })
      }
    },
    pageCount: 3,
    pageSizes: [],
    getPage: async () => null as never,
    destroy: async () => undefined
  } as unknown as PdfDocument
}

describe('flattenOutline', () => {
  test('depth-first with depth; empty → []', () => {
    expect(flattenOutline([])).toEqual([])
    const tree: OutlineNode[] = [
      {
        title: 'A',
        pageIndex: 0,
        children: [
          { title: 'A.1', pageIndex: 1, children: [] },
          { title: 'A.2', pageIndex: 2, children: [{ title: 'A.2.1', pageIndex: 3, children: [] }] }
        ]
      },
      { title: 'B', pageIndex: null, children: [] }
    ]
    expect(flattenOutline(tree)).toEqual([
      { title: 'A', pageIndex: 0, depth: 0 },
      { title: 'A.1', pageIndex: 1, depth: 1 },
      { title: 'A.2', pageIndex: 2, depth: 1 },
      { title: 'A.2.1', pageIndex: 3, depth: 2 },
      { title: 'B', pageIndex: null, depth: 0 }
    ])
  })
})

describe('pageIndexFromBookmarkTarget / mapBookmark', () => {
  test('destination pageIndex', () => {
    expect(
      pageIndexFromBookmarkTarget({
        type: 'destination',
        destination: { pageIndex: 2, zoom: { mode: 1 as never }, view: [] }
      })
    ).toBe(2)
    expect(pageIndexFromBookmarkTarget(undefined)).toBeNull()
  })

  test('maps tree', () => {
    const node = mapBookmark({
      title: 'Ch',
      target: {
        type: 'destination',
        destination: { pageIndex: 0, zoom: { mode: 1 as never }, view: [] }
      },
      children: [{ title: 'Sub', target: undefined }]
    })
    expect(node).toEqual({
      title: 'Ch',
      pageIndex: 0,
      children: [{ title: 'Sub', pageIndex: null, children: [] }]
    })
  })
})

describe('loadOutline', () => {
  test('empty / missing outline returns []', async () => {
    expect(await loadOutline(fakeDoc([]))).toEqual([])
    expect(await loadOutline(fakeDoc(() => {
      throw new Error('boom')
    }))).toEqual([])
  })

  test('maps bookmarks with page indexes', async () => {
    const nodes = await loadOutline(
      fakeDoc([
        {
          title: 'Chapter 1',
          target: {
            type: 'destination',
            destination: { pageIndex: 0, zoom: { mode: 1 as never }, view: [] }
          },
          children: [
            {
              title: 'Section 1.1',
              target: {
                type: 'destination',
                destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
              },
              children: []
            }
          ]
        },
        { title: 'Broken', target: undefined, children: [] }
      ])
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
