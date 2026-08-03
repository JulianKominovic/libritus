import type { PdfDocument } from './PdfDocument'
import { isPdfJobCancelled } from './isPdfJobCancelled'
import { FIXED_RENDER_SCALE, renderPageToCanvas, type AbortableRender } from './PdfRenderer'

export const DEFAULT_POOL_SIZE = 12
/** Host concurrency — EmbedPDF worker abort is client-only; limit posts so cancel-before-send works. */
const MAX_CONCURRENT = 2

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
  task: AbortableRender
}

export type PagePoolOptions = {
  poolSize?: number
  /** PDFium scaleFactor (native points). Prefer renderScaleForWorld(worldScale). */
  renderScale?: number
}

/** Prefer pages near the middle of a top→bottom visible list when capping. */
export function capPreferCenter(indices: number[], max: number): number[] {
  if (indices.length <= max) return indices
  const mid = (indices.length - 1) / 2
  const ranked = indices
    .map((pageIndex, i) => ({ pageIndex, dist: Math.abs(i - mid) }))
    .sort((a, b) => a.dist - b.dist || a.pageIndex - b.pageIndex)
  return ranked
    .slice(0, max)
    .map((r) => r.pageIndex)
    .sort((a, b) => a - b)
}

/**
 * Fixed pool of canvas slots. Evicts LRU pages when capacity is exceeded.
 * Renders once at a fixed bitmap scale; zoom is CSS-only on the parent layer.
 * Hard-capped at poolSize (never grows with needed). Host queue (MAX_CONCURRENT)
 * so off-screen cancel drops work before postMessage when possible.
 */
export class PagePool {
  private readonly slots = new Map<number, PageSlot>()
  private readonly jobs = new Map<number, ActiveJob>()
  /** Queued but not yet posted to the worker. */
  private pending: number[] = []
  /** Between startRender enter and finally (includes await getPage + render). */
  private readonly inFlight = new Set<number>()
  /** Invalidates stale completions after cancel / supersede. */
  private readonly runToken = new Map<number, number>()
  private readonly wanted = new Set<number>()
  private readonly poolSize: number
  private readonly renderScale: number
  private clock = 0
  private lastVisibleKey = ''
  private destroyed = false
  private listeners = new Set<() => void>()
  private drainResolvers: Array<() => void> = []

  constructor(
    private doc: PdfDocument,
    options: PagePoolOptions = {}
  ) {
    this.poolSize = options.poolSize ?? DEFAULT_POOL_SIZE
    this.renderScale = options.renderScale ?? FIXED_RENDER_SCALE
  }

  get capacity(): number {
    return this.poolSize
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

    const capped = capPreferCenter(visibleIndices, this.poolSize)
    const visibleKey = capped.join(',')

    if (visibleKey === this.lastVisibleKey) {
      for (const pageIndex of capped) {
        const slot = this.slots.get(pageIndex)
        if (slot) slot.lastUsed = ++this.clock
      }
      return
    }
    this.lastVisibleKey = visibleKey

    this.wanted.clear()
    for (const pageIndex of capped) this.wanted.add(pageIndex)

    // Cancel in-flight off-screen (client abort; worker may still run).
    for (const [pageIndex, job] of this.jobs) {
      if (!this.wanted.has(pageIndex)) {
        this.invalidateRun(pageIndex)
        try {
          job.task.cancel()
        } catch {
          /* ignore */
        }
        this.jobs.delete(pageIndex)
      }
    }

    // Drop pending before postMessage — real cancel for EmbedPDF.
    this.pending = this.pending.filter((pageIndex) => this.wanted.has(pageIndex))

    for (const pageIndex of capped) {
      const slot = this.slots.get(pageIndex)
      if (slot) slot.lastUsed = ++this.clock
    }

    this.evictUntil()

    // Center-first enqueue so nearest pages start first under concurrency cap.
    const mid = (capped.length - 1) / 2
    const order = capped
      .map((pageIndex, i) => ({ pageIndex, dist: Math.abs(i - mid) }))
      .sort((a, b) => a.dist - b.dist || a.pageIndex - b.pageIndex)

    for (const { pageIndex } of order) {
      const existing = this.slots.get(pageIndex)
      if (existing?.ready) {
        existing.lastUsed = ++this.clock
        continue
      }
      // Still visible + already rendering — do not cancel/restart.
      if (this.inFlight.has(pageIndex) || this.jobs.has(pageIndex)) continue
      if (this.pending.includes(pageIndex)) continue

      if (!this.slots.has(pageIndex) && this.slots.size >= this.poolSize) {
        this.evictOne(this.wanted)
      }
      this.ensureSlot(pageIndex)
      this.pending.push(pageIndex)
    }

    this.pump()
    await this.waitUntilDrain()
  }

  private invalidateRun(pageIndex: number): void {
    this.runToken.set(pageIndex, (this.runToken.get(pageIndex) ?? 0) + 1)
  }

  private waitUntilDrain(): Promise<void> {
    if (this.pending.length === 0 && this.inFlight.size === 0) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      this.drainResolvers.push(resolve)
    })
  }

  private resolveDrain(): void {
    if (this.pending.length > 0 || this.inFlight.size > 0) return
    const resolvers = this.drainResolvers
    this.drainResolvers = []
    for (const resolve of resolvers) resolve()
  }

  private pump(): void {
    if (this.destroyed) {
      this.resolveDrain()
      return
    }
    while (this.inFlight.size < MAX_CONCURRENT && this.pending.length > 0) {
      const pageIndex = this.pending.shift()!
      if (!this.wanted.has(pageIndex)) continue
      if (this.slots.get(pageIndex)?.ready) continue
      if (this.inFlight.has(pageIndex) || this.jobs.has(pageIndex)) continue
      void this.startRender(pageIndex)
    }
    this.resolveDrain()
  }

  /** Hard cap: capacity is always poolSize. */
  private evictUntil(): void {
    while (this.slots.size > this.poolSize) {
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

    const pageIndex = victim.pageIndex
    const job = this.jobs.get(pageIndex)
    if (job) {
      this.invalidateRun(pageIndex)
      try {
        job.task.cancel()
      } catch {
        /* ignore */
      }
      this.jobs.delete(pageIndex)
    }
    this.pending = this.pending.filter((i) => i !== pageIndex)
    victim.canvas.width = 0
    victim.canvas.height = 0
    this.slots.delete(pageIndex)
  }

  private ensureSlot(pageIndex: number): PageSlot {
    let slot = this.slots.get(pageIndex)
    if (!slot) {
      slot = {
        pageIndex,
        scale: this.renderScale,
        canvas: document.createElement('canvas'),
        ready: false,
        lastUsed: ++this.clock
      }
      this.slots.set(pageIndex, slot)
    } else {
      slot.lastUsed = ++this.clock
    }
    return slot
  }

  private async startRender(pageIndex: number): Promise<void> {
    const scale = this.renderScale
    const slot = this.ensureSlot(pageIndex)
    slot.ready = false
    slot.scale = scale

    const token = (this.runToken.get(pageIndex) ?? 0) + 1
    this.runToken.set(pageIndex, token)
    this.inFlight.add(pageIndex)

    let ownTask: AbortableRender | null = null
    try {
      const page = await this.doc.getPage(pageIndex)
      if (this.destroyed || this.runToken.get(pageIndex) !== token) return
      if (!this.wanted.has(pageIndex) || !this.slots.has(pageIndex)) return

      ownTask = renderPageToCanvas(
        this.doc.engine,
        this.doc.handle,
        page,
        slot.canvas,
        scale
      )
      this.jobs.set(pageIndex, { pageIndex, scale, task: ownTask })
      this.pump()

      await ownTask.promise

      if (this.jobs.get(pageIndex)?.task === ownTask) {
        this.jobs.delete(pageIndex)
      }

      if (this.destroyed || this.runToken.get(pageIndex) !== token) return
      if (!this.wanted.has(pageIndex) || !this.slots.has(pageIndex)) return

      slot.ready = true
      slot.scale = scale
      this.notify()
    } catch (err) {
      if (ownTask && this.jobs.get(pageIndex)?.task === ownTask) {
        this.jobs.delete(pageIndex)
      }
      if (this.destroyed || this.runToken.get(pageIndex) !== token) return
      if (!this.wanted.has(pageIndex)) return
      if (isPdfJobCancelled(err)) return
      console.error(`Failed to render page ${pageIndex}`, err)
    } finally {
      this.inFlight.delete(pageIndex)
      // Only re-queue when this start was invalidated (cancel/evict) while still wanted —
      // not on success or real render errors (would loop forever).
      const superseded = this.runToken.get(pageIndex) !== token
      if (
        !this.destroyed &&
        superseded &&
        this.wanted.has(pageIndex) &&
        this.slots.has(pageIndex) &&
        !this.slots.get(pageIndex)?.ready &&
        !this.inFlight.has(pageIndex) &&
        !this.jobs.has(pageIndex) &&
        !this.pending.includes(pageIndex)
      ) {
        this.pending.push(pageIndex)
      }
      this.pump()
    }
  }

  destroy(): void {
    this.destroyed = true
    this.wanted.clear()
    this.pending = []
    for (const pageIndex of this.jobs.keys()) {
      this.invalidateRun(pageIndex)
    }
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
    this.resolveDrain()
  }
}
