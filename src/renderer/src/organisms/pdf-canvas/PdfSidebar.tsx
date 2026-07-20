import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import type { AnnotationListItem } from '@renderer/lib/pdf-canvas/annotationList'
import type { OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
import type { ThumbPool, ThumbSlot } from '@renderer/lib/pdf-canvas/ThumbPool'
import { cn } from '@renderer/lib/utils'
import { useVirtualizer } from '@tanstack/react-virtual'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type PdfSidebarHandle = {
  setActivePage: (page1Based: number) => void
}

export type PdfSidebarProps = {
  outline: OutlineNode[]
  pageCount: number
  thumbPool: ThumbPool
  annotations: AnnotationListItem[]
  initialPage?: number
  onGoToPage: (pageIndex0: number) => void
  onSelectAnnotation: (id: string) => void
}

const THUMB_MAX_H = 200
/** Padding + gap + page label under the thumb. */
const THUMB_ROW_CHROME = 36

type Tab = 'outline' | 'pages' | 'annotations'

const pressable = 'transition-transform duration-150 ease-out active:not-disabled:scale-[0.99]'

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
              className={cn(
                'min-h-10 w-full rounded-md px-2 py-2 text-left text-xs leading-snug',
                'disabled:cursor-not-allowed disabled:opacity-40',
                pressable,
                enabled
                  ? 'text-morphing-900 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-morphing-50'
                  : 'text-morphing-400'
              )}
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
    canvas.style.width = 'auto'
    canvas.style.height = 'auto'
    canvas.style.maxWidth = '100%'
    canvas.style.maxHeight = `${THUMB_MAX_H}px`
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
      className={cn(
        'flex w-full flex-col items-center gap-1.5 rounded-lg px-2.5 py-1.5',
        'transition-[transform,background-color] duration-150 ease-out active:scale-[0.96]',
        active ? 'bg-morphing-100' : '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-morphing-50'
      )}
      onClick={() => onGoToPage(pageIndex0)}
    >
      <div
        className={cn(
          'flex max-h-[200px] max-w-full items-center justify-center overflow-hidden rounded-md bg-white outline-solid outline-1 -outline-offset-1',
          active ? 'outline-black/20 shadow-sm' : 'outline-black/10'
        )}
      >
        {slot?.ready ? (
          <div
            ref={hostRef}
            className="flex max-h-[200px] max-w-full items-center justify-center"
          />
        ) : (
          <div className="h-[200px] w-[140px] animate-pulse bg-morphing-100" />
        )}
      </div>
      <span className="text-[11px] tabular-nums text-morphing-600">{pageIndex0 + 1}</span>
    </button>
  )
}

export const PdfSidebar = forwardRef<PdfSidebarHandle, PdfSidebarProps>(function PdfSidebar(
  { outline, pageCount, thumbPool, annotations, initialPage = 1, onGoToPage, onSelectAnnotation },
  ref
) {
  const [tab, setTab] = useState<Tab>(outline.length > 0 ? 'outline' : 'pages')
  const [tick, setTick] = useState(0)
  const activePageRef = useRef(initialPage)
  const activeMarkerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => listRef.current,
    estimateSize: () => THUMB_MAX_H + THUMB_ROW_CHROME,
    overscan: 2,
    enabled: tab === 'pages'
  })
  const virtualItems = virtualizer.getVirtualItems()

  // Sidebar often mounts before loadOutline resolves; flip Pages → Outline once nodes arrive.
  useEffect(() => {
    if (outline.length === 0) return
    setTab((prev) => (prev === 'pages' ? 'outline' : prev))
  }, [outline.length])

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

  useEffect(() => {
    if (tab !== 'pages') return
    void thumbPool.syncVisible(virtualItems.map((item) => item.index))
  }, [tab, thumbPool, virtualItems])

  // Radix unmounts inactive TabsContent → scrollRect stays 0 until remeasured after layout.
  useEffect(() => {
    if (tab !== 'pages' || pageCount <= 0) return
    const id = requestAnimationFrame(() => {
      virtualizer.measure()
      virtualizer.scrollToIndex(activePageRef.current - 1, { align: 'center' })
    })
    return () => cancelAnimationFrame(id)
  }, [tab, pageCount, virtualizer])

  const active = activePageRef.current
  void tick // subscribe-driven re-renders

  return (
    <aside
      aria-label="Document outline, page thumbnails, and annotations"
      className={cn(
        'pointer-events-auto absolute bottom-3 right-3 top-0.5 z-100 flex max-w-sm w-full flex-col overflow-hidden',
        'rounded-xl bg-neutral-50 text-neutral-900',
        'shadow-md shadow-morphing-900/10 ring-1 ring-black/10'
      )}
    >
      <Tabs
        value={tab}
        onValueChange={(v) => setTab(v as Tab)}
        className="flex min-h-0 flex-1 flex-col gap-0"
      >
        <TabsList className="h-10 w-[calc(100%-1rem)] rounded-lg m-2">
          <TabsTrigger value="outline">Outline</TabsTrigger>
          <TabsTrigger value="pages">Pages</TabsTrigger>
          <TabsTrigger value="annotations">Annotations</TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="mt-0 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
          {outline.length === 0 ? (
            <p className="px-2 py-3 text-xs text-pretty text-morphing-400">
              No outline in this PDF.
            </p>
          ) : (
            <OutlineTree nodes={outline} depth={0} onGoToPage={onGoToPage} />
          )}
        </TabsContent>

        <TabsContent value="pages" className="relative mt-0 min-h-0 flex-1 overflow-hidden">
          {/* absolute inset-0: h-full is 0 on remount before flex settles; virtualizer then paints nothing */}
          <div ref={listRef} className="absolute inset-0 overflow-y-auto px-1.5 pb-2">
            <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
              {virtualItems.map((item) => (
                <div
                  key={item.key}
                  data-index={item.index}
                  ref={virtualizer.measureElement}
                  className="absolute left-0 top-0 w-full"
                  style={{ transform: `translateY(${item.start}px)` }}
                >
                  <ThumbRow
                    pageIndex0={item.index}
                    active={item.index + 1 === active}
                    slot={thumbPool.getSlot(item.index)}
                    onGoToPage={onGoToPage}
                  />
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent
          value="annotations"
          className="mt-0 min-h-0 flex-1 overflow-y-auto px-1.5 pb-2"
        >
          {annotations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-pretty text-morphing-400">
              No highlights or notes yet.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {annotations.map((item) => {
                const kindLabel = item.kind === 'highlight' ? 'Highlight' : 'Note'
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      aria-label={`${kindLabel}: ${item.preview}`}
                      className={cn(
                        'min-h-10 w-full rounded-md px-2 py-2 text-left',
                        pressable,
                        '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-morphing-50'
                      )}
                      onClick={() => onSelectAnnotation(item.id)}
                    >
                      <span className="block text-[10px] uppercase tracking-wide text-morphing-500">
                        {kindLabel}
                      </span>
                      <span className="block truncate text-xs leading-snug text-morphing-900">
                        {item.preview}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  )
})
