import { describe, expect, mock, test } from 'bun:test'
import type { PdfDocument } from './PdfDocument'

// Minimal canvas for PagePool.renderSlot
if (typeof globalThis.document === 'undefined') {
  ;(globalThis as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, style: {}, getContext: () => null }
      }
      return { style: {} }
    }
  }
}

mock.module('./PdfRenderer', () => ({
  FIXED_RENDER_SCALE: 2,
  renderPageToCanvas: async (_page: unknown, canvas: { width: number; height: number }) => {
    canvas.width = 10
    canvas.height = 10
    return {
      promise: Promise.resolve(),
      cancel: () => undefined
    }
  }
}))

const { PagePool } = await import('./PagePool')

function fakeDoc(): PdfDocument {
  let calls = 0
  const doc = {
    pageCount: 5,
    pageSizes: Array.from({ length: 5 }, () => ({ width: 100, height: 200 })),
    getPageCalls: () => calls,
    getPage: async () => {
      calls++
      return {
        getViewport: () => ({ width: 200, height: 400 }),
        cleanup: () => undefined
      } as never
    },
    destroy: async () => undefined,
    proxy: {} as never
  }
  return doc as unknown as PdfDocument & { getPageCalls: () => number }
}

describe('PagePool', () => {
  test('same visible key skips re-render; new set grows slots', async () => {
    const doc = fakeDoc() as PdfDocument & { getPageCalls: () => number }
    const pool = new PagePool(doc, { poolSize: 2 })

    await pool.syncVisible([0, 1])
    const afterFirst = doc.getPageCalls()
    expect(afterFirst).toBe(2)
    expect(pool.getSlot(0)?.ready).toBe(true)

    await pool.syncVisible([0, 1])
    expect(doc.getPageCalls()).toBe(afterFirst)

    // More pages than poolSize — capacity = max(poolSize, needed)
    await pool.syncVisible([0, 1, 2, 3])
    expect(pool.getSlots().length).toBe(4)
    expect(doc.getPageCalls()).toBeGreaterThan(afterFirst)

    pool.destroy()
    expect(pool.getSlots().length).toBe(0)
  })
})
