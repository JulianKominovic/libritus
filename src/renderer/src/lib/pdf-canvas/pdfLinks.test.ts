import { describe, expect, test } from 'bun:test'
import { PdfActionType, PdfAnnotationSubtype, type PdfTask } from '@embedpdf/models'
import type { PdfDocument } from './PdfDocument'
import { findPdfLinkAt, loadPageLinks, mapLinkAnnotation } from './pdfLinks'
import type { PageRect } from './types'

function resolveTask<T>(value: T): PdfTask<T> {
  return {
    toPromise: async () => value,
    wait: (ok: (v: T) => void) => ok(value),
    abort: () => undefined,
    onProgress: () => undefined
  } as unknown as PdfTask<T>
}

const page: PageRect = { pageIndex: 0, x: 10, y: 20, width: 612, height: 792 }

describe('mapLinkAnnotation', () => {
  test('destination LINK → scene + local rects', () => {
    const hit = mapLinkAnnotation(
      {
        type: PdfAnnotationSubtype.LINK,
        pageIndex: 0,
        rect: { origin: { x: 50, y: 100 }, size: { width: 120, height: 20 } },
        target: {
          type: 'destination',
          destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
        }
      },
      page,
      2
    )
    expect(hit).toEqual({
      kind: 'internal',
      pageIndex: 0,
      targetPageIndex: 1,
      localX: 100,
      localY: 200,
      localWidth: 240,
      localHeight: 40,
      x: 110,
      y: 220,
      width: 240,
      height: 40
    })
  })

  test('Goto action → target page; RemoteGoto / empty / mailto → null', () => {
    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'action',
            action: {
              type: PdfActionType.Goto,
              destination: { pageIndex: 3, zoom: { mode: 1 as never }, view: [] }
            }
          }
        },
        page,
        1
      )
    ).toMatchObject({ kind: 'internal', targetPageIndex: 3 })

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'action',
            action: { type: PdfActionType.URI, uri: 'mailto:a@b.test' }
          }
        },
        page,
        1
      )
    ).toBeNull()

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'action',
            action: {
              type: PdfActionType.RemoteGoto,
              destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
            }
          }
        },
        page,
        1
      )
    ).toBeNull()

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: undefined
        },
        page,
        1
      )
    ).toBeNull()
  })

  test('URI http(s) → http hit; javascript / file → null', () => {
    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 5, y: 6 }, size: { width: 10, height: 8 } },
          target: {
            type: 'action',
            action: { type: PdfActionType.URI, uri: 'https://example.com/path' }
          }
        },
        page,
        1
      )
    ).toEqual({
      kind: 'http',
      url: 'https://example.com/path',
      pageIndex: 0,
      localX: 5,
      localY: 6,
      localWidth: 10,
      localHeight: 8,
      x: 15,
      y: 26,
      width: 10,
      height: 8
    })

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'action',
            action: { type: PdfActionType.URI, uri: 'javascript:alert(1)' }
          }
        },
        page,
        1
      )
    ).toBeNull()

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'action',
            action: { type: PdfActionType.URI, uri: 'file:///tmp/x' }
          }
        },
        page,
        1
      )
    ).toBeNull()
  })

  test('non-LINK / zero-size → null', () => {
    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.HIGHLIGHT,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
          target: {
            type: 'destination',
            destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
          }
        },
        page,
        1
      )
    ).toBeNull()

    expect(
      mapLinkAnnotation(
        {
          type: PdfAnnotationSubtype.LINK,
          pageIndex: 0,
          rect: { origin: { x: 0, y: 0 }, size: { width: 0, height: 10 } },
          target: {
            type: 'destination',
            destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
          }
        },
        page,
        1
      )
    ).toBeNull()
  })
})

describe('findPdfLinkAt', () => {
  const links = [
    {
      kind: 'internal' as const,
      pageIndex: 0,
      targetPageIndex: 2,
      x: 100,
      y: 200,
      width: 50,
      height: 20,
      localX: 90,
      localY: 180,
      localWidth: 50,
      localHeight: 20
    }
  ]

  test('hit / miss', () => {
    expect(findPdfLinkAt(links, 110, 210)).toMatchObject({ kind: 'internal', targetPageIndex: 2 })
    expect(findPdfLinkAt(links, 99, 210)).toBeNull()
    expect(findPdfLinkAt(links, 110, 221)).toBeNull()
  })
})

describe('loadPageLinks', () => {
  test('keeps dest + http URI; ignores other annots; engine errors throw', async () => {
    const doc = {
      handle: { id: 'x', pageCount: 2, pages: [{ index: 0, size: { width: 612, height: 792 } }] },
      engine: {
        getPageAnnotations: () =>
          resolveTask([
            {
              type: PdfAnnotationSubtype.HIGHLIGHT,
              pageIndex: 0,
              id: 'h',
              rect: { origin: { x: 0, y: 0 }, size: { width: 5, height: 5 } }
            },
            {
              type: PdfAnnotationSubtype.LINK,
              pageIndex: 0,
              id: 'l',
              rect: { origin: { x: 10, y: 20 }, size: { width: 30, height: 12 } },
              target: {
                type: 'destination',
                destination: { pageIndex: 1, zoom: { mode: 1 as never }, view: [] }
              }
            },
            {
              type: PdfAnnotationSubtype.LINK,
              pageIndex: 0,
              id: 'uri',
              rect: { origin: { x: 0, y: 0 }, size: { width: 10, height: 10 } },
              target: { type: 'action', action: { type: PdfActionType.URI, uri: 'https://x.test' } }
            }
          ])
      },
      getPage: async (i: number) => ({ index: i, size: { width: 612, height: 792 } })
    } as unknown as PdfDocument

    const hits = await loadPageLinks(doc, 0, page, 1)
    expect(hits).toHaveLength(2)
    expect(hits[0]).toMatchObject({ kind: 'internal', targetPageIndex: 1, x: 20, y: 40 })
    expect(hits[1]).toMatchObject({ kind: 'http', url: 'https://x.test' })

    const boom = {
      handle: { id: 'x', pageCount: 1, pages: [] },
      engine: {
        getPageAnnotations: () => {
          throw new Error('boom')
        }
      },
      getPage: async () => ({ index: 0, size: { width: 1, height: 1 } })
    } as unknown as PdfDocument
    await expect(loadPageLinks(boom, 0, page, 1)).rejects.toThrow('boom')
  })
})
