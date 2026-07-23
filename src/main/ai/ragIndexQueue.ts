export const RAG_VERSION = 1
/** Defaults match embedder.ts — avoid importing transformers in unit tests. */
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2'
const DEFAULT_DIMS = 384

export type RagChunkInput = {
  id: string
  pageIndex: number
  chapterTitle?: string
  text: string
}

export type RagEnqueueArgs = {
  pdfId: string
  fingerprint: string
  chunks: RagChunkInput[]
  title?: string
}

export type RagQueueActive = {
  pdfId: string
  title?: string
  fingerprint: string
  phase: 'downloading_model' | 'embedding'
  done: number
  total: number
}

export type RagQueuePending = {
  pdfId: string
  title?: string
}

export type RagQueueSnapshot = {
  active: RagQueueActive | null
  pending: RagQueuePending[]
  /** Set after a job writes (or disk-hit / empty). UI uses this — do not re-read rag.json on every tick. */
  lastFinished: { pdfId: string; chunkCount: number } | null
}

type PendingJob = RagEnqueueArgs

export type StoredRagIndex = {
  version: number
  pdfId: string
  fingerprint: string
  embeddingModel: string
  dims: number
  chunks: Array<RagChunkInput & { embedding: number[] }>
}

export type RagIndexDeps = {
  readMeta: (pdfId: string) => Promise<RagMeta | null>
  writeIndex: (pdfId: string, index: StoredRagIndex) => Promise<void>
  embed: (
    texts: string[],
    onProgress?: (p: { done: number; total: number; status: string }) => void
  ) => Promise<number[][]>
  ensureModel: (onStatus?: (status: 'downloading' | 'loading' | 'ready') => void) => Promise<void>
  onSnapshot: (snapshot: RagQueueSnapshot) => void
  /** Override in tests; production uses embedder constants. */
  embeddingModel?: string
  embeddingDims?: number
}

export type RagMeta = {
  version: number
  fingerprint: string
  embeddingModel: string
  chunkCount: number
}

function metaMatches(
  existing: RagMeta | null,
  fingerprint: string,
  chunkCount: number,
  embeddingModel: string
): boolean {
  return (
    !!existing &&
    existing.fingerprint === fingerprint &&
    existing.embeddingModel === embeddingModel &&
    existing.chunkCount === chunkCount
  )
}

/**
 * Serial RAG embed queue. One active job; others pending.
 * // ponytail: serial only — MiniLM saturates main; parallel if UtilityProcess
 */
export function createRagIndexQueue(deps: RagIndexDeps) {
  const embeddingModel = deps.embeddingModel ?? DEFAULT_MODEL
  const embeddingDims = deps.embeddingDims ?? DEFAULT_DIMS

  let active: RagQueueActive | null = null
  let pending: PendingJob[] = []
  let lastFinished: { pdfId: string; chunkCount: number } | null = null
  let pumping = false
  let activeGen = 0
  const cancelledActive = new Set<string>()

  function snapshot(): RagQueueSnapshot {
    return {
      active,
      pending: pending.map((p) => ({ pdfId: p.pdfId, title: p.title })),
      lastFinished
    }
  }

  function emit(): void {
    deps.onSnapshot(snapshot())
  }

  async function pump(): Promise<void> {
    if (pumping) return
    pumping = true
    try {
      while (pending.length > 0) {
        const job = pending.shift()!
        const gen = ++activeGen
        cancelledActive.delete(job.pdfId)

        active = {
          pdfId: job.pdfId,
          title: job.title,
          fingerprint: job.fingerprint,
          phase: 'downloading_model',
          done: 0,
          total: job.chunks.length
        }
        emit()

        try {
          await deps.ensureModel((status) => {
            if (gen !== activeGen || cancelledActive.has(job.pdfId)) return
            if (status === 'downloading' || status === 'loading') {
              active = { ...active!, phase: 'downloading_model' }
              emit()
            }
          })

          if (gen !== activeGen || cancelledActive.has(job.pdfId)) {
            active = null
            emit()
            continue
          }

          const vectors = await deps.embed(
            job.chunks.map((c) => c.text),
            (p) => {
              if (gen !== activeGen || cancelledActive.has(job.pdfId)) return
              active = {
                pdfId: job.pdfId,
                title: job.title,
                fingerprint: job.fingerprint,
                phase:
                  p.status === 'embedding' || p.status === 'ready'
                    ? 'embedding'
                    : 'downloading_model',
                done: p.done,
                total: p.total
              }
              emit()
            }
          )

          if (gen !== activeGen || cancelledActive.has(job.pdfId)) {
            active = null
            emit()
            continue
          }

          const index: StoredRagIndex = {
            version: RAG_VERSION,
            pdfId: job.pdfId,
            fingerprint: job.fingerprint,
            embeddingModel,
            dims: embeddingDims,
            chunks: job.chunks.map((c, i) => ({
              ...c,
              embedding: vectors[i] ?? []
            }))
          }
          await deps.writeIndex(job.pdfId, index)
          lastFinished = { pdfId: job.pdfId, chunkCount: index.chunks.length }
        } catch (err) {
          console.error(`RAG index failed for ${job.pdfId}`, err)
        }

        active = null
        emit()
      }
    } finally {
      pumping = false
      if (pending.length > 0) void pump()
    }
  }

  return {
    getSnapshot: snapshot,

    async enqueue(args: RagEnqueueArgs): Promise<{ ok: true; skipped?: 'disk' | 'duplicate' }> {
      if (args.chunks.length === 0) {
        const existing = await deps.readMeta(args.pdfId)
        if (metaMatches(existing, args.fingerprint, 0, embeddingModel)) {
          lastFinished = { pdfId: args.pdfId, chunkCount: 0 }
          emit()
          return { ok: true, skipped: 'disk' }
        }
        await deps.writeIndex(args.pdfId, {
          version: RAG_VERSION,
          pdfId: args.pdfId,
          fingerprint: args.fingerprint,
          embeddingModel,
          dims: embeddingDims,
          chunks: []
        })
        lastFinished = { pdfId: args.pdfId, chunkCount: 0 }
        emit()
        return { ok: true, skipped: 'disk' }
      }

      const existing = await deps.readMeta(args.pdfId)
      if (metaMatches(existing, args.fingerprint, args.chunks.length, embeddingModel)) {
        lastFinished = { pdfId: args.pdfId, chunkCount: existing!.chunkCount }
        emit()
        return { ok: true, skipped: 'disk' }
      }

      if (active && active.pdfId === args.pdfId && active.fingerprint === args.fingerprint) {
        return { ok: true, skipped: 'duplicate' }
      }

      const pendingIdx = pending.findIndex((p) => p.pdfId === args.pdfId)
      if (pendingIdx >= 0) {
        const prev = pending[pendingIdx]!
        if (prev.fingerprint === args.fingerprint) {
          return { ok: true, skipped: 'duplicate' }
        }
        pending[pendingIdx] = args
        emit()
        return { ok: true }
      }

      if (active && active.pdfId === args.pdfId && active.fingerprint !== args.fingerprint) {
        cancelledActive.add(args.pdfId)
        activeGen++
        active = null
      }

      pending.push(args)
      emit()
      void pump()
      return { ok: true }
    },

    cancel(pdfId: string): void {
      const before = pending.length
      pending = pending.filter((p) => p.pdfId !== pdfId)
      let cancelledRunning = false
      if (active?.pdfId === pdfId) {
        cancelledActive.add(pdfId)
        activeGen++
        active = null
        cancelledRunning = true
      }
      if (before !== pending.length || cancelledRunning) emit()
    }
  }
}
