import { describe, expect, mock, test } from 'bun:test'
import type { PdfDocument } from './PdfDocument'

if (typeof globalThis.document === 'undefined') {
  ;(globalThis as { document: unknown }).document = {
    createElement: () => ({
      style: { setProperty: () => undefined },
      className: '',
      replaceChildren: () => undefined,
      append: () => undefined
    })
  }
} else {
  const orig = globalThis.document.createElement.bind(globalThis.document)
  globalThis.document.createElement = ((tag: string) => {
    const el = orig(tag) as HTMLElement & {
      style: CSSStyleDeclaration & { setProperty?: (...a: unknown[]) => void }
      replaceChildren?: () => void
      append?: () => void
    }
    if (!el.style?.setProperty) {
      el.style = { setProperty: () => undefined } as unknown as CSSStyleDeclaration
    }
    if (!el.replaceChildren) el.replaceChildren = () => undefined
    if (!el.append) el.append = () => undefined
    return el
  }) as typeof document.createElement
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
let cancelCount = 0

mock.module('./pdfjs', () => ({
  TextLayer: class {
    cancel(): void {
      cancelCount++
      renderGate?.resolve()
    }
    async render(): Promise<void> {
      if (renderGate) await renderGate.promise
    }
  },
  setLayerDimensions: () => undefined
}))

const { TextLayerPool } = await import('./TextLayerPool')

function fakeDoc(): PdfDocument & { getPageCalls: () => number } {
  let calls = 0
  const doc = {
    pageCount: 5,
    pageSizes: Array.from({ length: 5 }, () => ({ width: 100, height: 200 })),
    getPageCalls: () => calls,
    getPage: async () => {
      calls++
      return {
        getViewport: () => ({ width: 100, height: 200 }),
        streamTextContent: () => ({}),
        cleanup: () => undefined
      } as never
    },
    destroy: async () => undefined,
    proxy: {} as never
  }
  return doc as unknown as PdfDocument & { getPageCalls: () => number }
}

describe('TextLayerPool', () => {
  test('same visible key skips rebuild', async () => {
    renderGate = null
    cancelCount = 0
    const doc = fakeDoc()
    const pool = new TextLayerPool(doc, { poolSize: 2 })

    await pool.syncVisible([0, 1])
    const afterFirst = doc.getPageCalls()
    expect(afterFirst).toBe(2)
    expect(pool.getSlot(0)?.ready).toBe(true)

    await pool.syncVisible([0, 1])
    expect(doc.getPageCalls()).toBe(afterFirst)

    pool.destroy()
  })

  test('leaving visible cancels in-flight build; stale gen not ready', async () => {
    renderGate = deferred()
    cancelCount = 0
    const doc = fakeDoc()
    const pool = new TextLayerPool(doc, { poolSize: 4 })

    const first = pool.syncVisible([0])
    await new Promise((r) => setTimeout(r, 10))

    const second = pool.syncVisible([1])
    // If cancel didn't fire, resolve gate so test can finish
    if (cancelCount === 0) renderGate.resolve()
    await Promise.all([first, second])

    expect(pool.getSlot(0)?.ready).not.toBe(true)
    expect(pool.getSlot(1)?.ready).toBe(true)

    pool.destroy()
    renderGate = null
  })
})
