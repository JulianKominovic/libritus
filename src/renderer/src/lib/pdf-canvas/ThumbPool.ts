import type { PdfDocument } from './PdfDocument'
import { isPdfJobCancelled } from './isPdfJobCancelled'
import { renderPageToCanvas, type AbortableRender } from './PdfRenderer'
import { PoolCore } from './pool-core'

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
  task: AbortableRender
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
export class ThumbPool extends PoolCore<ThumbSlot> {
  private readonly jobs = new Map<number, ActiveJob>()
  private generation = 0
  private lastVisibleKey = ''

  constructor(
    private doc: PdfDocument,
    options: ThumbPoolOptions = {}
  ) {
    super(options.poolSize ?? DEFAULT_POOL_SIZE)
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
        if (slot) this.touch(slot)
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
      if (slot) this.touch(slot)
    }

    this.evictUntil()

    const renders: Promise<void>[] = []
    for (const pageIndex of capped) {
      const existing = this.slots.get(pageIndex)
      if (existing?.ready) {
        this.touch(existing)
        continue
      }

      if (!this.slots.has(pageIndex) && this.slots.size >= this.poolSize) {
        this.evictLru(visible)
      }

      renders.push(this.renderSlot(pageIndex, gen))
    }

    await Promise.all(renders)
  }

  /** Cancel/drop the job for an evicted page. */
  protected onEvict(pageIndex: number): void {
    const job = this.jobs.get(pageIndex)
    if (job) {
      try {
        job.task.cancel()
      } catch {
        /* ignore */
      }
      this.jobs.delete(pageIndex)
    }
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
      this.touch(slot)
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

      const task = renderPageToCanvas(this.doc.engine, this.doc.handle, page, slot.canvas, scale)
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
      if (isPdfJobCancelled(err)) return
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
    this.clearSlotsAndListeners()
    this.lastVisibleKey = ''
  }
}
