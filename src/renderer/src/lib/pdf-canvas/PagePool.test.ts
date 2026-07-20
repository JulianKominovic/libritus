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
  renderPageToCanvas: async (_page: unknown, canvas: { width: number; height: number }) => {
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

const { PagePool } = await import('./PagePool')

function fakeDoc(): PdfDocument & { getPageCalls: () => number } {
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
    renderGate = null
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 2 })

    await pool.syncVisible([0, 1])
    const afterFirst = doc.getPageCalls()
    expect(afterFirst).toBe(2)
    expect(pool.getSlot(0)?.ready).toBe(true)

    await pool.syncVisible([0, 1])
    expect(doc.getPageCalls()).toBe(afterFirst)

    await pool.syncVisible([0, 1, 2, 3])
    expect(pool.getSlots().length).toBe(4)
    expect(doc.getPageCalls()).toBeGreaterThan(afterFirst)

    pool.destroy()
    expect(pool.getSlots().length).toBe(0)
  })

  test('stale generation mid-render does not mark ready', async () => {
    renderGate = deferred()
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 4 })

    const first = pool.syncVisible([0])
    // Let getPage + renderPageToCanvas start and park on gate
    await new Promise((r) => setTimeout(r, 10))

    // Change visible set → bumps generation; in-flight page 0 should not become ready
    const second = pool.syncVisible([1])
    renderGate.resolve()
    await Promise.all([first, second])

    expect(pool.getSlot(0)?.ready).not.toBe(true)
    expect(pool.getSlot(1)?.ready).toBe(true)

    pool.destroy()
    renderGate = null
  })

  test('uses injected renderScale on slots', async () => {
    renderGate = null
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 2, renderScale: 3.5 })

    await pool.syncVisible([0])
    expect(pool.getSlot(0)?.scale).toBe(3.5)

    pool.destroy()
  })
})
