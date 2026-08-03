import { describe, expect, mock, test } from 'bun:test'
import type { PdfDocument } from './PdfDocument'

if (typeof globalThis.document === 'undefined') {
  ;(globalThis as { document: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return { width: 0, height: 0, style: {}, getContext: () => null }
      }
      return { style: {}, className: '', replaceChildren: () => undefined, append: () => undefined }
    }
  }
}

type Deferred = {
  promise: Promise<void>
  resolve: () => void
}

function deferred(): Deferred {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

let renderGate: Deferred | null = null

mock.module('./PdfRenderer', () => ({
  FIXED_RENDER_SCALE: 2,
  renderPageToCanvas: (
    _engine: unknown,
    _doc: unknown,
    _page: unknown,
    canvas: { width: number; height: number }
  ) => {
    canvas.width = 10
    canvas.height = 10
    const gate = renderGate
    return {
      promise: gate ? gate.promise : Promise.resolve(),
      cancel: () => {
        gate?.resolve()
      }
    }
  }
}))

const { ThumbPool, THUMB_SCALE } = await import('./ThumbPool')

function fakeDoc(): PdfDocument & { getPageCalls: () => number } {
  let calls = 0
  const doc = {
    pageCount: 10,
    pageSizes: Array.from({ length: 10 }, () => ({ width: 100, height: 200 })),
    getPageCalls: () => calls,
    getPage: async () => {
      calls++
      return {} as never
    },
    destroy: async () => undefined
  }
  return doc as unknown as PdfDocument & { getPageCalls: () => number }
}

describe('ThumbPool', () => {
  test('hard cap: never grows past poolSize even if more indices requested', async () => {
    renderGate = null
    const doc = fakeDoc()
    const pool = new ThumbPool(doc, { poolSize: 2 })

    await pool.syncVisible([0, 1, 2, 3, 4])
    expect(pool.getSlots().length).toBeLessThanOrEqual(2)
    expect(THUMB_SCALE).toBe(0.75)

    pool.destroy()
    expect(pool.getSlots().length).toBe(0)
  })

  test('stale generation mid-render does not mark ready', async () => {
    renderGate = deferred()
    const doc = fakeDoc()
    const pool = new ThumbPool(doc, { poolSize: 4 })

    const first = pool.syncVisible([0])
    await new Promise((r) => setTimeout(r, 10))

    const second = pool.syncVisible([1])
    renderGate.resolve()
    await Promise.all([first, second])

    expect(pool.getSlot(0)?.ready).not.toBe(true)
    expect(pool.getSlot(1)?.ready).toBe(true)

    pool.destroy()
    renderGate = null
  })
})
