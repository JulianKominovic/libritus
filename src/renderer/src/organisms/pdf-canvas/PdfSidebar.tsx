import { Tabs, TabsContent, TabsList, TabsTrigger } from '@renderer/components/ui/tabs'
import { useLang } from '@renderer/i18n/lang-context'
import type { TranslationsKeys } from '@renderer/i18n/translations-keys'
import type { AnnotationListItem } from '@renderer/lib/pdf-canvas/annotationList'
import {
  flattenOutline,
  type FlatOutlineRow,
  type OutlineNode
} from '@renderer/lib/pdf-canvas/pdfOutline'
import type { ThumbPool, ThumbSlot } from '@renderer/lib/pdf-canvas/ThumbPool'
import { cn } from '@renderer/lib/utils'
import { useSettings, type PdfSidebarTab } from '@renderer/stores/settings'
import { useVirtualizer } from '@tanstack/react-virtual'
import { DynamicIcon } from 'lucide-react/dynamic'
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import { NoteStaticBody } from './NoteEmbed'

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
  onGoToAnnotation: (id: string) => void
}

const THUMB_MAX_H = 200
/** Padding + gap + page label under the thumb. */
const THUMB_ROW_CHROME = 36
/** Outline row min-h-10; measureElement corrects wrap. */
const OUTLINE_ROW_EST = 40
/** Header + FadeClip max-h + padding; measureElement corrects. */
const ANN_ROW_EST = 248

type Tab = PdfSidebarTab

const pressable = 'transition-transform duration-150 ease-out active:not-disabled:scale-[0.99]'

function formatAnnotationDate(iso: string, lang: 'en' | 'es'): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString(lang, { year: 'numeric', month: 'short', day: 'numeric' })
}

function kindLabel(kind: AnnotationListItem['kind']): TranslationsKeys {
  if (kind === 'highlight') return 'sidebar_annotation_kind_highlight'
  if (kind === 'note') return 'sidebar_annotation_kind_note'
  if (kind === 'image') return 'sidebar_annotation_kind_image'
  return 'sidebar_annotation_kind_search'
}

function initialTab(outlineLen: number, preferred: PdfSidebarTab): Tab {
  if (preferred === 'annotations' || preferred === 'pages') return preferred
  return outlineLen > 0 ? 'outline' : 'pages'
}

/** max-h 200px clip; bottom fade only when content overflows. */
function FadeClip({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [fade, setFade] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const check = () => setFade(el.scrollHeight > el.clientHeight + 1)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [children])

  return (
    <div
      ref={ref}
      className="max-h-50 w-full overflow-hidden"
      style={
        fade
          ? {
              maskImage: 'linear-gradient(to bottom, #000 70%, transparent)',
              WebkitMaskImage: 'linear-gradient(to bottom, #000 70%, transparent)'
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

function AnnotationThumb({ src, alt }: { src: string; alt: string }) {
  return (
    <img
      src={src}
      alt={alt}
      className="block w-full rounded-lg object-cover object-top outline -outline-offset-1 outline-black/10"
    />
  )
}

function AnnotationRow({
  item,
  onGoToAnnotation
}: {
  item: AnnotationListItem
  onGoToAnnotation: (id: string) => void
}) {
  const { t, lang } = useLang()
  const label = t(kindLabel(item.kind))
  const date = formatAnnotationDate(item.createdAt, lang)
  const aria =
    item.kind === 'highlight' && item.pageIndex != null
      ? `${label}, ${t('sidebar_page_label', { page: item.pageIndex + 1 })}: ${item.preview}`
      : `${label}: ${item.preview}`

  return (
    <button
      type="button"
      aria-label={aria}
      className={cn('w-full rounded-xl px-2 py-2 text-left', pressable, 'hover:bg-neutral-200')}
      onClick={() => onGoToAnnotation(item.id)}
    >
      <span className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
        <span className="flex shrink-0 items-baseline gap-2 text-[10px] tabular-nums text-neutral-400">
          {item.kind === 'highlight' && item.pageIndex != null ? (
            <>
              <span>{t('sidebar_page_label', { page: item.pageIndex + 1 })}</span>
              <span className="-mx-1">•</span>
            </>
          ) : null}
          {date ? <span>{date}</span> : null}
        </span>
      </span>
      <FadeClip>
        {item.kind === 'highlight' ? (
          <span className="block text-xs leading-snug text-neutral-900 italic">{item.preview}</span>
        ) : null}
        {item.kind === 'note' ? (
          <div className="pointer-events-none overflow-hidden rounded-lg bg-white outline -outline-offset-1 outline-black/10">
            <NoteStaticBody value={item.plateValue ?? [{ type: 'p', children: [{ text: '' }] }]} />
          </div>
        ) : null}
        {item.kind === 'search' ? (
          item.fileDataURL ? (
            <AnnotationThumb src={item.fileDataURL} alt={item.query || item.preview} />
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-3 text-xs text-neutral-700 ring-1 ring-black/5">
              <DynamicIcon
                name="globe"
                className="size-3.5 shrink-0 text-neutral-400"
                aria-hidden
              />
              <span className="truncate">{item.query || item.preview}</span>
            </div>
          )
        ) : null}
        {item.kind === 'image' ? (
          item.fileDataURL ? (
            <AnnotationThumb src={item.fileDataURL} alt={item.preview} />
          ) : (
            <div className="flex items-center gap-2 rounded-lg bg-white px-2 py-3 text-xs text-neutral-700 ring-1 ring-black/5">
              <DynamicIcon
                name="image"
                className="size-3.5 shrink-0 text-neutral-400"
                aria-hidden
              />
              <span className="truncate">{item.preview}</span>
            </div>
          )
        ) : null}
      </FadeClip>
    </button>
  )
}

function OutlineRow({
  row,
  onGoToPage
}: {
  row: FlatOutlineRow
  onGoToPage: (pageIndex0: number) => void
}) {
  const { t } = useLang()
  const enabled = row.pageIndex != null
  return (
    <button
      type="button"
      disabled={!enabled}
      aria-label={
        enabled
          ? t('sidebar_outline_go_to_page', { title: row.title, page: row.pageIndex! + 1 })
          : t('sidebar_outline_unavailable', { title: row.title })
      }
      className={cn(
        'min-h-10 w-full rounded-xl px-2 py-2 text-left text-xs leading-snug',
        'disabled:cursor-not-allowed disabled:opacity-40',
        pressable,
        enabled ? 'text-neutral-900 hover:bg-neutral-200' : 'text-neutral-400'
      )}
      style={{ paddingLeft: 8 + row.depth * 12 }}
      onClick={() => {
        if (row.pageIndex != null) onGoToPage(row.pageIndex)
      }}
    >
      {row.title}
    </button>
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
  const { t } = useLang()
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
      aria-label={t('sidebar_thumb_go_to_page', { page: pageIndex0 + 1 })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex w-full flex-col items-center gap-1.5 rounded-xl px-2.5 py-1.5',
        pressable,
        'hover:bg-neutral-200',
        active && 'bg-neutral-100'
      )}
      onClick={() => onGoToPage(pageIndex0)}
    >
      <div
        className={cn(
          'flex max-h-50 max-w-full items-center justify-center overflow-hidden rounded-md bg-white outline-solid outline-1 -outline-offset-1',
          active ? 'outline-black/20 shadow-sm' : 'outline-black/10'
        )}
      >
        {slot?.ready ? (
          <div ref={hostRef} className="flex max-h-50 max-w-full items-center justify-center" />
        ) : (
          <div className="h-50 w-35 animate-pulse bg-neutral-100" />
        )}
      </div>
      <span className="text-[11px] tabular-nums text-neutral-600">{pageIndex0 + 1}</span>
    </button>
  )
}

export const PdfSidebar = forwardRef<PdfSidebarHandle, PdfSidebarProps>(function PdfSidebar(
  { outline, pageCount, thumbPool, annotations, initialPage = 1, onGoToPage, onGoToAnnotation },
  ref
) {
  const { t } = useLang()
  const tRef = useRef(t)
  tRef.current = t
  const preferredTab = useSettings((s) => s.pdfSidebarTab)
  const setPdfSidebarTab = useSettings((s) => s.setPdfSidebarTab)
  const [tab, setTab] = useState<Tab>(() => initialTab(outline.length, preferredTab))
  const [tick, setTick] = useState(0)
  const activePageRef = useRef(initialPage)
  const activeMarkerRef = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const outlineListRef = useRef<HTMLDivElement>(null)
  const annotationsListRef = useRef<HTMLDivElement>(null)

  // Apply persisted tab after zustand rehydrate; also promote outline once nodes arrive
  // when preference is outline (never steal pages/annotations).
  useEffect(() => {
    setTab(initialTab(outline.length, preferredTab))
  }, [preferredTab, outline.length])

  const flatOutline = useMemo(() => flattenOutline(outline), [outline])

  const virtualizer = useVirtualizer({
    count: pageCount,
    getScrollElement: () => listRef.current,
    estimateSize: () => THUMB_MAX_H + THUMB_ROW_CHROME,
    overscan: 2,
    enabled: tab === 'pages'
  })
  const virtualItems = virtualizer.getVirtualItems()

  const outlineVirtualizer = useVirtualizer({
    count: flatOutline.length,
    getScrollElement: () => outlineListRef.current,
    estimateSize: () => OUTLINE_ROW_EST,
    overscan: 8,
    enabled: tab === 'outline' && flatOutline.length > 0
  })
  const outlineVirtualItems = outlineVirtualizer.getVirtualItems()

  const annotationsVirtualizer = useVirtualizer({
    count: annotations.length,
    getScrollElement: () => annotationsListRef.current,
    estimateSize: () => ANN_ROW_EST,
    gap: 8,
    overscan: 4,
    enabled: tab === 'annotations' && annotations.length > 0
  })
  const annotationVirtualItems = annotationsVirtualizer.getVirtualItems()

  const onTabChange = useCallback(
    (v: string) => {
      const next = v as Tab
      setTab(next)
      setPdfSidebarTab(next)
    },
    [setPdfSidebarTab]
  )

  const syncActiveMarker = useCallback((page1Based: number) => {
    const el = activeMarkerRef.current
    if (!el) return
    el.textContent = tRef.current('sidebar_page_label', { page: page1Based })
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

  useEffect(() => {
    if (tab !== 'outline' || flatOutline.length === 0) return
    const id = requestAnimationFrame(() => outlineVirtualizer.measure())
    return () => cancelAnimationFrame(id)
  }, [tab, flatOutline.length, outlineVirtualizer])

  useEffect(() => {
    if (tab !== 'annotations' || annotations.length === 0) return
    const id = requestAnimationFrame(() => annotationsVirtualizer.measure())
    return () => cancelAnimationFrame(id)
  }, [tab, annotations.length, annotationsVirtualizer])

  const active = activePageRef.current
  void tick // subscribe-driven re-renders

  return (
    <aside
      aria-label={t('sidebar_aria')}
      className={cn(
        'pointer-events-auto absolute bottom-3 right-3 top-[52px] z-100 flex max-w-sm w-full flex-col overflow-hidden',
        'rounded-xl bg-neutral-50 text-neutral-900',
        'shadow-md shadow-neutral-900/10 ring-1 ring-black/10'
      )}
      data-pdf-sidebar
    >
      <Tabs value={tab} onValueChange={onTabChange} className="flex min-h-0 flex-1 flex-col gap-0">
        <TabsList className="m-2 h-auto min-h-10 w-[calc(100%-1rem)] flex-wrap rounded-lg">
          <TabsTrigger value="outline" className={pressable}>
            {t('sidebar_tab_outline')}
          </TabsTrigger>
          <TabsTrigger value="pages" className={pressable}>
            {t('sidebar_tab_pages')}
          </TabsTrigger>
          <TabsTrigger value="annotations" className={pressable}>
            {t('sidebar_tab_annotations')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="relative mt-0 min-h-0 flex-1 overflow-hidden">
          {flatOutline.length === 0 ? (
            <p className="px-2 py-3 text-xs text-pretty text-neutral-400">
              {t('sidebar_outline_empty')}
            </p>
          ) : (
            <div ref={outlineListRef} className="absolute inset-0 overflow-y-auto px-1.5 pb-2">
              <div
                className="relative w-full"
                style={{ height: outlineVirtualizer.getTotalSize() }}
              >
                {outlineVirtualItems.map((item) => {
                  const row = flatOutline[item.index]!
                  return (
                    <div
                      key={item.key}
                      data-index={item.index}
                      ref={outlineVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <OutlineRow row={row} onGoToPage={onGoToPage} />
                    </div>
                  )
                })}
              </div>
            </div>
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

        <TabsContent value="annotations" className="relative mt-0 min-h-0 flex-1 overflow-hidden">
          {annotations.length === 0 ? (
            <p className="px-2 py-3 text-xs text-pretty text-neutral-400">
              {t('sidebar_annotations_empty')}
            </p>
          ) : (
            <div
              ref={annotationsListRef}
              role="list"
              className="absolute inset-0 overflow-y-auto px-1.5 pb-2"
            >
              <div
                className="relative w-full"
                style={{ height: annotationsVirtualizer.getTotalSize() }}
              >
                {annotationVirtualItems.map((item) => {
                  const ann = annotations[item.index]!
                  return (
                    <div
                      key={item.key}
                      role="listitem"
                      data-index={item.index}
                      ref={annotationsVirtualizer.measureElement}
                      className="absolute left-0 top-0 w-full"
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <AnnotationRow item={ann} onGoToAnnotation={onGoToAnnotation} />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </aside>
  )
})
