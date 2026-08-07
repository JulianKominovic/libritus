/** Minimal slot shape shared by the fixed LRU canvas pools. */
export type PoolSlot = {
  pageIndex: number
  canvas: HTMLCanvasElement
  ready: boolean
  lastUsed: number
}

/**
 * Shared LRU slot core for PagePool / ThumbPool: slot map, LRU clock,
 * hard capacity (= poolSize, never grows), subscribe/notify and the
 * getSlot/getSlots surface. Job/render semantics stay in the concrete pools.
 */
export abstract class PoolCore<T extends PoolSlot> {
  protected readonly slots = new Map<number, T>()
  protected readonly poolSize: number
  protected destroyed = false
  protected clock = 0
  private readonly listeners = new Set<() => void>()

  constructor(poolSize: number) {
    this.poolSize = poolSize
  }

  /** Hard cap: capacity is always poolSize. */
  get capacity(): number {
    return this.poolSize
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  protected notify(): void {
    for (const listener of this.listeners) listener()
  }

  getSlots(): T[] {
    return [...this.slots.values()]
  }

  getSlot(pageIndex: number): T | undefined {
    return this.slots.get(pageIndex)
  }

  /** Bump a slot's recency for LRU eviction. */
  protected touch(slot: { lastUsed: number }): void {
    slot.lastUsed = ++this.clock
  }

  /** Zero a slot's canvas and drop it from the map. */
  protected releaseSlot(slot: T): void {
    slot.canvas.width = 0
    slot.canvas.height = 0
    this.slots.delete(slot.pageIndex)
  }

  /** Evict the least-recently-used slot outside `keep` (default: none kept). */
  protected evictLru(keep: Set<number> = new Set()): void {
    let victim: T | null = null
    for (const slot of this.slots.values()) {
      if (keep.has(slot.pageIndex)) continue
      if (!victim || slot.lastUsed < victim.lastUsed) victim = slot
    }
    if (!victim) return
    this.onEvict(victim.pageIndex)
    this.releaseSlot(victim)
  }

  protected evictUntil(): void {
    while (this.slots.size > this.poolSize) {
      this.evictLru()
    }
  }

  /** Hook: cancel/drop the concrete pool's job for an evicted page. */
  protected abstract onEvict(pageIndex: number): void

  /** Zero + drop every slot and unsubscribe all listeners (on destroy). */
  protected clearSlotsAndListeners(): void {
    for (const slot of this.slots.values()) {
      slot.canvas.width = 0
      slot.canvas.height = 0
    }
    this.slots.clear()
    this.listeners.clear()
  }
}
