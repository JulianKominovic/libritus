import type { PdfDocument } from './PdfDocument'
import type { RenderTask } from './pdfjs'
import { FIXED_RENDER_SCALE, renderPageToCanvas } from './PdfRenderer'

const DEFAULT_POOL_SIZE = 12

export type PageSlot = {
  pageIndex: number
  scale: number
  canvas: HTMLCanvasElement
  ready: boolean
  lastUsed: number
}

type ActiveJob = {
  pageIndex: number
  scale: number
  task: RenderTask
  generation: number
}

export type PagePoolOptions = {
  poolSize?: number
  /** pdf.js scale (native points). Prefer renderScaleForWorld(worldScale). */
  renderScale?: number
}

/**
 * Fixed pool of canvas slots. Evicts LRU pages when capacity is exceeded.
 * Renders once at a fixed bitmap scale; zoom is CSS-only on the parent layer.
 * Cancels in-flight renders when a page leaves the visible set.
 */
export class PagePool {
  private readonly slots = new Map<number, PageSlot>()
  private readonly jobs = new Map<number, ActiveJob>()
  private readonly poolSize: number
  private readonly renderScale: number
  private generation = 0
  private clock = 0
  private lastVisibleKey = ''
  private destroyed = false
  private listeners = new Set<() => void>()

  constructor(
    private doc: PdfDocument,
    options: PagePoolOptions = {}
  ) {
    this.poolSize = options.poolSize ?? DEFAULT_POOL_SIZE
    this.renderScale = options.renderScale ?? FIXED_RENDER_SCALE
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  getSlots(): PageSlot[] {
    return [...this.slots.values()]
  }

  getSlot(pageIndex: number): PageSlot | undefined {
    return this.slots.get(pageIndex)
  }

  async syncVisible(visibleIndices: number[]): Promise<void> {
    if (this.destroyed) return

    const visibleKey = visibleIndices.join(',')
    const visible = new Set(visibleIndices)

    // Zoom-only camera updates keep the same page set — don't bump generation
    // or restart in-flight renders (bitmap is fixed-scale; CSS scales the parent).
    if (visibleKey === this.lastVisibleKey) {
      for (const pageIndex of visibleIndices) {
        const slot = this.slots.get(pageIndex)
        if (slot) slot.lastUsed = ++this.clock
      }
      return
    }
    this.lastVisibleKey = visibleKey

    this.generation += 1
    const gen = this.generation

    for (const [pageIndex, job] of this.jobs) {
      if (!visible.has(pageIndex)) {
        try {
          job.task.cancel()
        } catch {
          /* ignore */
        }
        this.jobs.delete(pageIndex)
      }
    }

    for (const [pageIndex, slot] of this.slots) {
      if (!visible.has(pageIndex)) continue
      slot.lastUsed = ++this.clock
    }

    this.evictUntil(visible.size)

    const renders: Promise<void>[] = []
    for (const pageIndex of visibleIndices) {
      const existing = this.slots.get(pageIndex)
      if (existing?.ready) {
        existing.lastUsed = ++this.clock
        continue
      }

      if (!this.slots.has(pageIndex) && this.slots.size >= this.poolSize) {
        this.evictOne(visible)
      }

      renders.push(this.renderSlot(pageIndex, gen))
    }

    await Promise.all(renders)
  }

  private evictUntil(needed: number): void {
    const capacity = Math.max(this.poolSize, needed)
    while (this.slots.size > capacity) {
      this.evictOne(new Set())
    }
  }

  private evictOne(keep: Set<number>): void {
    let victim: PageSlot | null = null
    for (const slot of this.slots.values()) {
      if (keep.has(slot.pageIndex)) continue
      if (!victim || slot.lastUsed < victim.lastUsed) {
        victim = slot
      }
    }
    if (!victim) return

    const job = this.jobs.get(victim.pageIndex)
    if (job) {
      try {
        job.task.cancel()
      } catch {
        /* ignore */
      }
      this.jobs.delete(victim.pageIndex)
    }
    this.slots.delete(victim.pageIndex)
  }

  private async renderSlot(pageIndex: number, gen: number): Promise<void> {
    const scale = this.renderScale
    let slot = this.slots.get(pageIndex)
    if (!slot) {
      slot = {
        pageIndex,
        scale,
        canvas: document.createElement('canvas'),
        ready: false,
        lastUsed: ++this.clock
      }
      this.slots.set(pageIndex, slot)
    } else {
      slot.ready = false
      slot.scale = scale
      slot.lastUsed = ++this.clock
    }

    const existingJob = this.jobs.get(pageIndex)
    if (existingJob) {
      try {
        existingJob.task.cancel()
      } catch {
        /* ignore */
      }
      this.jobs.delete(pageIndex)
    }

    try {
      const page = await this.doc.getPage(pageIndex)
      if (gen !== this.generation) return

      const task = await renderPageToCanvas(page, slot.canvas, scale)
      this.jobs.set(pageIndex, { pageIndex, scale, task, generation: gen })
      await task.promise
      this.jobs.delete(pageIndex)

      if (gen !== this.generation) return
      if (!this.slots.has(pageIndex)) return

      slot.ready = true
      slot.scale = scale
      this.notify()
    } catch (err) {
      this.jobs.delete(pageIndex)
      if (this.destroyed || gen !== this.generation) return
      const name = err instanceof Error ? err.name : ''
      if (name === 'AbortException' || name === 'RenderingCancelledException') return
      console.error(`Failed to render page ${pageIndex}`, err)
    }
  }

  destroy(): void {
    this.destroyed = true
    this.generation += 1
    for (const job of this.jobs.values()) {
      try {
        job.task.cancel()
      } catch {
        /* ignore */
      }
    }
    this.jobs.clear()
    this.slots.clear()
    this.listeners.clear()
    this.lastVisibleKey = ''
  }
}
