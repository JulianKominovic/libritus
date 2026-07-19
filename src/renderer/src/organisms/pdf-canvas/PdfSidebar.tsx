import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState
} from 'react'
import type { OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
import type { ThumbPool, ThumbSlot } from '@renderer/lib/pdf-canvas/ThumbPool'

export type PdfSidebarHandle = {
  setActivePage: (page1Based: number) => void
}

export type PdfSidebarProps = {
  outline: OutlineNode[]
  pageCount: number
  thumbPool: ThumbPool
  initialPage?: number
  onGoToPage: (pageIndex0: number) => void
}

const THUMB_ROW_H = 118
const THUMB_BUFFER = 2

type Tab = 'outline' | 'pages'

function OutlineTree({
  nodes,
  depth,
  onGoToPage
}: {
  nodes: OutlineNode[]
  depth: number
  onGoToPage: (pageIndex0: number) => void
}) {
  if (nodes.length === 0) return null
  return (
    <ul className={depth === 0 ? 'space-y-0.5' : 'mt-0.5 space-y-0.5'}>
      {nodes.map((node, i) => {
        const enabled = node.pageIndex != null
        return (
          <li key={`${depth}-${i}-${node.title}`}>
            <button
              type="button"
              disabled={!enabled}
              aria-label={
                enabled
                  ? `Go to ${node.title}, page ${node.pageIndex! + 1}`
                  : `${node.title} (unavailable)`
              }
              className={`w-full rounded px-2 py-1 text-left text-xs leading-snug disabled:cursor-not-allowed disabled:opacity-40 ${
                enabled ? 'text-white hover:bg-neutral-800' : 'text-neutral-500'
              }`}
              style={{ paddingLeft: 8 + depth * 12 }}
              onClick={() => {
                if (node.pageIndex != null) onGoToPage(node.pageIndex)
              }}
            >
              {node.title}
            </button>
            {node.children.length > 0 ? (
              <OutlineTree nodes={node.children} depth={depth + 1} onGoToPage={onGoToPage} />
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function ThumbRow({
  pageIndex0,
  active,
  slot,
  onGoToPage
}: {
  pageIndex0: number
  active: boolean
  slot: ThumbSlot | undefined
  onGoToPage: (pageIndex0: number) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host || !slot?.ready) return
    const canvas = slot.canvas
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = 'auto'
    host.replaceChildren(canvas)
    return () => {
      if (canvas.parentElement === host) host.removeChild(canvas)
    }
  }, [slot, slot?.ready])

  return (
    <button
      type="button"
      aria-label={`Go to page ${pageIndex0 + 1}`}
      aria-current={active ? 'page' : undefined}
      className={`absolute left-0 right-0 flex flex-col items-center gap-1 px-2 py-1 ${
        active ? 'bg-neutral-800' : 'hover:bg-neutral-800/60'
      }`}
      style={{ top: pageIndex0 * THUMB_ROW_H, height: THUMB_ROW_H }}
      onClick={() => onGoToPage(pageIndex0)}
    >
      <div
        className={`w-full overflow-hidden rounded border bg-white ${
          active ? 'border-white' : 'border-neutral-700'
        }`}
        style={{ height: THUMB_ROW_H - 28 }}
      >
        {slot?.ready ? (
          <div ref={hostRef} className="flex h-full items-start justify-center" />
        ) : (
          <div className="h-full w-full animate-pulse bg-neutral-200" />
        )}
      </div>
      <span className="text-[11px] tabular-nums text-neutral-300">{pageIndex0 + 1}</span>
    </button>
  )
}

export const PdfSidebar = forwardRef<PdfSidebarHandle, PdfSidebarProps>(function PdfSidebar(
  { outline, pageCount, thumbPool, initialPage = 1, onGoToPage },
  ref
) {
  const [tab, setTab] = useState<Tab>(outline.length > 0 ? 'outline' : 'pages')
  const [tick, setTick] = useState(0)
  const [range, setRange] = useState({ start: 0, end: Math.min(pageCount, 8) })
  const activePageRef = useRef(initialPage)
  const activeMarkerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const syncActiveMarker = useCallback((page1Based: number) => {
    const el = activeMarkerRef.current
    if (!el) return
    el.textContent = `Page ${page1Based}`
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      setActivePage(page1Based: number) {
        const clamped = Math.min(pageCount, Math.max(1, page1Based))
        if (clamped === activePageRef.current) return
        activePageRef.current = clamped
        syncActiveMarker(clamped)
        // Force thumb aria-current update without parent re-render of whole app.
        setTick((t) => t + 1)
      }
    }),
    [pageCount, syncActiveMarker]
  )

  useEffect(() => {
    const unsub = thumbPool.subscribe(() => setTick((t) => t + 1))
    return unsub
  }, [thumbPool])

  const updateVisible = useCallback(() => {
    const el = listRef.current
    if (!el || pageCount <= 0) return
    const scrollTop = el.scrollTop
    const viewH = el.clientHeight
    const start = Math.max(0, Math.floor(scrollTop / THUMB_ROW_H) - THUMB_BUFFER)
    const end = Math.min(
      pageCount,
      Math.ceil((scrollTop + viewH) / THUMB_ROW_H) + THUMB_BUFFER
    )
    setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    const indices: number[] = []
    for (let i = start; i < end; i++) indices.push(i)
    void thumbPool.syncVisible(indices)
  }, [pageCount, thumbPool])

  useEffect(() => {
    if (tab !== 'pages') return
    updateVisible()
  }, [tab, updateVisible, pageCount])

  // Scroll active page into view when switching to Pages tab.
  useEffect(() => {
    if (tab !== 'pages') return
    const el = listRef.current
    if (!el) return
    const top = (activePageRef.current - 1) * THUMB_ROW_H
    if (top < el.scrollTop || top > el.scrollTop + el.clientHeight - THUMB_ROW_H) {
      el.scrollTop = Math.max(0, top - el.clientHeight / 3)
    }
    updateVisible()
  }, [tab, updateVisible])

  const active = activePageRef.current
  const visibleIndices: number[] = []
  for (let i = range.start; i < range.end; i++) visibleIndices.push(i)
  void tick // subscribe-driven re-renders

  return (
    <aside
      aria-label="Document outline and page thumbnails"
      className="pointer-events-auto absolute bottom-3 left-3 top-3 z-100 flex w-52 flex-col overflow-hidden rounded-md bg-neutral-900 text-white shadow"
    >
      <div className="flex shrink-0 border-b border-neutral-700">
        <button
          type="button"
          aria-pressed={tab === 'outline'}
          className={`flex-1 px-2 py-1.5 text-xs font-medium ${
            tab === 'outline' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
          }`}
          onClick={() => setTab('outline')}
        >
          Outline
        </button>
        <button
          type="button"
          aria-pressed={tab === 'pages'}
          className={`flex-1 px-2 py-1.5 text-xs font-medium ${
            tab === 'pages' ? 'bg-neutral-800 text-white' : 'text-neutral-400 hover:text-white'
          }`}
          onClick={() => setTab('pages')}
        >
          Pages
        </button>
      </div>

      <div className="shrink-0 border-b border-neutral-800 px-2 py-1 text-[10px] text-neutral-400">
        <span ref={activeMarkerRef}>Page {active}</span>
      </div>

      {tab === 'outline' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-1">
          {outline.length === 0 ? (
            <p className="px-2 py-3 text-xs text-neutral-500">No outline in this PDF.</p>
          ) : (
            <OutlineTree nodes={outline} depth={0} onGoToPage={onGoToPage} />
          )}
        </div>
      ) : (
        <div
          ref={listRef}
          className="relative min-h-0 flex-1 overflow-y-auto"
          onScroll={updateVisible}
        >
          <div className="relative" style={{ height: pageCount * THUMB_ROW_H }}>
            {visibleIndices.map((pageIndex0) => (
              <ThumbRow
                key={pageIndex0}
                pageIndex0={pageIndex0}
                active={pageIndex0 + 1 === active}
                slot={thumbPool.getSlot(pageIndex0)}
                onGoToPage={onGoToPage}
              />
            ))}
          </div>
        </div>
      )}
    </aside>
  )
})
