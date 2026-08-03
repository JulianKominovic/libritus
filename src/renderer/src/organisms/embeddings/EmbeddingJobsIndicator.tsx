import { Progress } from '@renderer/components/ui/progress'
import { getRagQueueSnapshot, onRagQueue, type RagQueueSnapshot } from '@renderer/lib/ai/ipc'
import { usePdfs } from '@renderer/stores/categories'
import { useEffect, useMemo, useState } from 'react'

const IDLE: RagQueueSnapshot = { active: null, pending: [], lastFinished: null }

function pdfTitle(
  pdfId: string,
  fallback: string | undefined,
  lookup: Map<string, string>
): string {
  return lookup.get(pdfId) ?? fallback ?? pdfId.slice(0, 8)
}

/**
 * Global RAG embed queue status above Settings.
 * Hidden when idle.
 *
 * RAG/embeddings currently disabled in main (`src/main/ai/index.ts`); this
 * always stays idle until the feature is redone.
 */
export function EmbeddingJobsIndicator() {
  const [snapshot, setSnapshot] = useState<RagQueueSnapshot>(IDLE)
  const categories = usePdfs((s) => s.categories)

  const titles = useMemo(() => {
    const map = new Map<string, string>()
    for (const cat of categories) {
      for (const pdf of cat.pdfs) map.set(pdf.id, pdf.name)
    }
    return map
  }, [categories])

  useEffect(() => {
    let alive = true
    void getRagQueueSnapshot().then((s) => {
      if (alive) setSnapshot(s)
    })
    const unsub = onRagQueue((s) => {
      if (alive) setSnapshot(s)
    })
    return () => {
      alive = false
      unsub()
    }
  }, [])

  const idle = !snapshot.active && snapshot.pending.length === 0
  if (idle) return null

  const active = snapshot.active
  const pct = active && active.total > 0 ? Math.round((active.done / active.total) * 100) : null

  return (
    <div className="mb-2 w-full space-y-1.5 rounded-md bg-morphing-50 px-2.5 py-2 ring-1 ring-morphing-200">
      <p className="text-[10px] font-medium uppercase tracking-wide text-morphing-500">
        Embeddings
      </p>
      {active ? (
        <div className="space-y-1">
          <p
            className="truncate text-xs text-morphing-900"
            title={pdfTitle(active.pdfId, active.title, titles)}
          >
            {pdfTitle(active.pdfId, active.title, titles)}
          </p>
          <p className="text-[10px] tabular-nums text-morphing-600">
            {active.phase === 'downloading_model'
              ? 'Downloading model…'
              : `Indexing ${active.done}/${active.total}`}
          </p>
          {pct != null && active.phase === 'embedding' ? (
            <Progress value={pct} className="h-1" />
          ) : null}
        </div>
      ) : null}
      {snapshot.pending.length > 0 ? (
        <ul className="space-y-0.5 border-t border-morphing-200 pt-1.5">
          <li className="text-[10px] uppercase tracking-wide text-morphing-500">Queued</li>
          {snapshot.pending.map((p) => (
            <li
              key={p.pdfId}
              className="truncate text-xs text-morphing-700"
              title={pdfTitle(p.pdfId, p.title, titles)}
            >
              {pdfTitle(p.pdfId, p.title, titles)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
