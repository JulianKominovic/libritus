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
let renderStarts = 0
let cancelCount = 0
/** Per-page gate so concurrency tests can release one page at a time. */
let pageGates: Map<number, Deferred> | null = null
const cancelledError = Object.assign(new Error('cancelled'), { name: 'TaskAbortedError' })

mock.module('./PdfRenderer', () => ({
  FIXED_RENDER_SCALE: 2,
  renderPageToCanvas: (
    _engine: unknown,
    _doc: unknown,
    page: { index?: number },
    canvas: { width: number; height: number }
  ) => {
    canvas.width = 10
    canvas.height = 10
    renderStarts++
    const pageIndex = typeof page?.index === 'number' ? page.index : -1
    const gate = pageGates?.get(pageIndex) ?? renderGate
    let rejectPromise!: (err: unknown) => void
    const abortable = new Promise<void>((resolve, reject) => {
      rejectPromise = reject
      if (!gate) {
        resolve()
        return
      }
      gate.promise.then(resolve, reject)
    })
    return {
      promise: abortable,
      cancel: () => {
        cancelCount++
        rejectPromise(cancelledError)
      }
    }
  }
}))

const { PagePool, capPreferCenter } = await import('./PagePool')

function fakeDoc(pageCount = 10): PdfDocument & {
  getPageCalls: () => number
  getPageArgs: () => number[]
} {
  let calls = 0
  const args: number[] = []
  const doc = {
    pageCount,
    pageSizes: Array.from({ length: pageCount }, () => ({ width: 100, height: 200 })),
    engine: {},
    handle: {},
    getPageCalls: () => calls,
    getPageArgs: () => args,
    getPage: async (pageIndex: number) => {
      calls++
      args.push(pageIndex)
      return { index: pageIndex } as never
    },
    destroy: async () => undefined
  }
  return doc as unknown as PdfDocument & {
    getPageCalls: () => number
    getPageArgs: () => number[]
  }
}

describe('capPreferCenter', () => {
  test('returns input when under max', () => {
    expect(capPreferCenter([0, 1, 2], 5)).toEqual([0, 1, 2])
  })

  test('keeps pages nearest list center', () => {
    expect(capPreferCenter([0, 1, 2, 3, 4, 5], 2)).toEqual([2, 3])
  })
})

describe('PagePool', () => {
  test('same visible key skips re-render; hard-caps slots to poolSize', async () => {
    renderGate = null
    pageGates = null
    renderStarts = 0
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 2 })

    await pool.syncVisible([0, 1])
    const afterFirst = doc.getPageCalls()
    expect(afterFirst).toBe(2)
    expect(pool.getSlot(0)?.ready).toBe(true)

    await pool.syncVisible([0, 1])
    expect(doc.getPageCalls()).toBe(afterFirst)

    await pool.syncVisible([0, 1, 2, 3])
    expect(pool.getSlots().length).toBeLessThanOrEqual(2)
    expect(pool.getSlots().length).toBe(2)

    pool.destroy()
    expect(pool.getSlots().length).toBe(0)
  })

  test('off-screen page does not become ready; still-visible in-flight is not restarted', async () => {
    renderGate = null
    pageGates = new Map([
      [0, deferred()],
      [1, deferred()],
      [2, deferred()]
    ])
    renderStarts = 0
    cancelCount = 0
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 4 })

    const first = pool.syncVisible([0, 1])
    await new Promise((r) => setTimeout(r, 20))
    const startsAfterFirst = renderStarts
    expect(startsAfterFirst).toBeGreaterThanOrEqual(1)

    // Pan: drop 0, keep 1, add 2 — must not cancel/restart page 1.
    const second = pool.syncVisible([1, 2])
    await new Promise((r) => setTimeout(r, 20))

    const startsForPage1 = doc.getPageArgs().filter((i) => i === 1).length
    expect(startsForPage1).toBe(1)

    pageGates.get(0)?.resolve()
    pageGates.get(1)?.resolve()
    pageGates.get(2)?.resolve()
    await Promise.all([first, second])

    expect(pool.getSlot(0)?.ready).not.toBe(true)
    expect(pool.getSlot(1)?.ready).toBe(true)
    expect(pool.getSlot(2)?.ready).toBe(true)

    pool.destroy()
    pageGates = null
  })

  test('concurrency cap: at most 2 renders in flight; pending cancel never posts', async () => {
    renderGate = null
    const gates = [deferred(), deferred(), deferred(), deferred()]
    pageGates = new Map(gates.map((g, i) => [i, g]))
    renderStarts = 0
    cancelCount = 0
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 4 })

    const sync = pool.syncVisible([0, 1, 2, 3])
    await new Promise((r) => setTimeout(r, 30))

    expect(renderStarts).toBeLessThanOrEqual(2)

    // Drop 2 and 3 while still pending (not posted) or in-flight.
    const sync2 = pool.syncVisible([0, 1])
    await new Promise((r) => setTimeout(r, 10))

    const startsBeforeRelease = renderStarts
    gates[0]!.resolve()
    gates[1]!.resolve()
    gates[2]!.resolve()
    gates[3]!.resolve()
    await Promise.all([sync, sync2])

    // Pages 2/3 cancelled from pending should not inflate past what was already in flight.
    expect(renderStarts).toBe(startsBeforeRelease)
    expect(pool.getSlot(0)?.ready).toBe(true)
    expect(pool.getSlot(1)?.ready).toBe(true)
    expect(pool.getSlot(2)?.ready).not.toBe(true)
    expect(pool.getSlot(3)?.ready).not.toBe(true)

    pool.destroy()
    pageGates = null
  })

  test('cancelled in-flight does not mark ready after leave; re-enter renders once', async () => {
    renderGate = null
    const gate0 = deferred()
    const gate0b = deferred()
    pageGates = new Map([[0, gate0]])
    renderStarts = 0
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 4 })

    const first = pool.syncVisible([0])
    await new Promise((r) => setTimeout(r, 15))
    expect(renderStarts).toBe(1)

    const left = pool.syncVisible([1])
    await new Promise((r) => setTimeout(r, 15))
    expect(pool.getSlot(0)?.ready).not.toBe(true)

    pageGates.set(0, gate0b)
    const back = pool.syncVisible([0])
    await new Promise((r) => setTimeout(r, 15))
    expect(renderStarts).toBeGreaterThanOrEqual(2)

    gate0.resolve() // late settle of cancelled start — must not ready
    gate0b.resolve()
    await Promise.all([first, left, back])
    await new Promise((r) => setTimeout(r, 20))

    expect(pool.getSlot(0)?.ready).toBe(true)

    pool.destroy()
    pageGates = null
  })

  test('uses injected renderScale on slots', async () => {
    renderGate = null
    pageGates = null
    const doc = fakeDoc()
    const pool = new PagePool(doc, { poolSize: 2, renderScale: 3.5 })

    await pool.syncVisible([0])
    expect(pool.getSlot(0)?.scale).toBe(3.5)

    pool.destroy()
  })
})
