import type { RenderTask } from './pdfjs'
import type { PdfDocument } from './PdfDocument'
import { renderPageToCanvas } from './PdfRenderer'

// Sidebar ~220px wide; 0.75 keeps thumbs sharp on retina without PagePool-scale cost.
export const THUMB_SCALE = 0.75
const DEFAULT_POOL_SIZE = 16

export type ThumbSlot = {
  pageIndex: number
  scale: number
  canvas: HTMLCanvasElement
  ready: boolean
  lastUsed: number
}

type ActiveJob = {
  pageIndex: number
  task: RenderTask
  generation: number
}

export type ThumbPoolOptions = {
  poolSize?: number
}

/**
 * Hard-capped low-scale thumbnail pool. Separate from PagePool so sidebar
 * visibility never inflates the main render buffer.
 * Capacity is always poolSize — never grows with needed (AGENTS.md memory trap).
 */
export class ThumbPool {
  private readonly slots = new Map<number, ThumbSlot>()
  private readonly jobs = new Map<number, ActiveJob>()
  private readonly poolSize: number
  private generation = 0
  private clock = 0
  private lastVisibleKey = ''
  private destroyed = false
  private listeners = new Set<() => void>()

  constructor(
    private doc: PdfDocument,
    options: ThumbPoolOptions = {}
  ) {
    this.poolSize = options.poolSize ?? DEFAULT_POOL_SIZE
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private notify(): void {
    for (const listener of this.listeners) listener()
  }

  getSlots(): ThumbSlot[] {
    return [...this.slots.values()]
  }

  getSlot(pageIndex: number): ThumbSlot | undefined {
    return this.slots.get(pageIndex)
  }

  async syncVisible(visibleIndices: number[]): Promise<void> {
    if (this.destroyed) return

    // Cap request to poolSize so we never try to hold more than capacity.
    const capped =
      visibleIndices.length <= this.poolSize
        ? visibleIndices
        : visibleIndices.slice(0, this.poolSize)

    const visibleKey = capped.join(',')
    const visible = new Set(capped)

    if (visibleKey === this.lastVisibleKey) {
      for (const pageIndex of capped) {
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

    for (const pageIndex of capped) {
      const slot = this.slots.get(pageIndex)
      if (slot) slot.lastUsed = ++this.clock
    }

    this.evictUntil()

    const renders: Promise<void>[] = []
    for (const pageIndex of capped) {
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

  /** Hard cap: capacity is always poolSize. */
  private evictUntil(): void {
    while (this.slots.size > this.poolSize) {
      this.evictOne(new Set())
    }
  }

  private evictOne(keep: Set<number>): void {
    let victim: ThumbSlot | null = null
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
    victim.canvas.width = 0
    victim.canvas.height = 0
    this.slots.delete(victim.pageIndex)
  }

  private async renderSlot(pageIndex: number, gen: number): Promise<void> {
    const scale = THUMB_SCALE
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
      this.jobs.set(pageIndex, { pageIndex, task, generation: gen })
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
      console.error(`Failed to render thumb ${pageIndex}`, err)
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
    for (const slot of this.slots.values()) {
      slot.canvas.width = 0
      slot.canvas.height = 0
    }
    this.slots.clear()
    this.listeners.clear()
    this.lastVisibleKey = ''
  }
}
