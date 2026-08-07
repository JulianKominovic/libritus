import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject
} from 'react'
import { PagePointerProvider } from '@embedpdf/plugin-interaction-manager/react'
import { SelectionLayer } from '@embedpdf/plugin-selection/react'
import { useLang } from '@renderer/i18n/lang-context'
import type { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { worldAABBFromCamera } from '@renderer/lib/pdf-canvas/PageLayout'
import type { PdfDocument } from '@renderer/lib/pdf-canvas/PdfDocument'
import { findPdfLinkAt, loadPageLinks, type PdfLinkHit } from '@renderer/lib/pdf-canvas/pdfLinks'
import type { SearchMatch } from '@renderer/lib/pdf-canvas/pdfSearch'
import { screenDeltaToPdfPoint } from '@renderer/lib/pdf-canvas/screenDeltaToPdfPoint'
import { trimVisibleToCap, visibilityBuffer } from '@renderer/lib/pdf-canvas/visibilityBuffer'
import type { PagePool, PageSlot } from '@renderer/lib/pdf-canvas/PagePool'
import type { CameraState, PageRect } from '@renderer/lib/pdf-canvas/types'

export type PdfLayerHandle = {
  applyCamera: (camera: CameraState) => void
  /** Ephemeral search hit in page space; painted under the world camera transform. */
  setSearchHit: (hit: SearchMatch | null) => void
  /** Scene-space hit-test against cached internal link rects. */
  findLinkAt: (sceneX: number, sceneY: number) => number | null
}

type PdfLayerProps = {
  layout: PageLayout
  pool: PagePool
  doc: PdfDocument
  documentId: string
  onInternalLink: (pageIndex: number) => void
}

function visibleEqual(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function PageSlotView({
  page,
  slot,
  documentId,
  scale,
  cameraRef,
  links,
  onInternalLink
}: {
  page: PageRect
  slot?: PageSlot
  documentId: string
  scale: number
  cameraRef: RefObject<CameraState | null>
  links: PdfLinkHit[]
  onInternalLink: (pageIndex: number) => void
}) {
  const { t } = useLang()
  const canvasHostRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host || !slot?.ready) return

    const canvas = slot.canvas
    canvas.style.display = 'block'
    canvas.style.width = `${page.width}px`
    canvas.style.height = `${page.height}px`
    host.replaceChildren(canvas)

    return () => {
      if (canvas.parentElement === host) {
        host.removeChild(canvas)
      }
    }
  }, [slot, slot?.ready, page.width, page.height])

  const convertEventToPoint = useCallback(
    (event: PointerEvent, el: HTMLElement) => {
      const r = el.getBoundingClientRect()
      const z = cameraRef.current?.zoom ?? 1
      return screenDeltaToPdfPoint(event.clientX - r.left, event.clientY - r.top, z, scale)
    },
    [cameraRef, scale]
  )

  return (
    <div
      data-pdf-page={page.pageIndex}
      className="absolute bg-white shadow-sm"
      style={{
        left: page.x,
        top: page.y,
        width: page.width,
        height: page.height
      }}
    >
      <PagePointerProvider
        documentId={documentId}
        pageIndex={page.pageIndex}
        scale={scale}
        convertEventToPoint={convertEventToPoint}
        className="pointer-events-auto absolute inset-0"
      >
        {slot?.ready ? (
          <div ref={canvasHostRef} className="pointer-events-none h-full w-full" />
        ) : (
          <div className="pointer-events-none h-full w-full animate-pulse bg-neutral-100" />
        )}
        <SelectionLayer documentId={documentId} pageIndex={page.pageIndex} scale={scale} />
        {links.map((link, i) => (
          <button
            key={`${link.targetPageIndex}-${i}`}
            type="button"
            data-pdf-link
            data-target-page={link.targetPageIndex}
            aria-label={t('layer_link_go_to_page_aria', { page: link.targetPageIndex + 1 })}
            className="absolute cursor-pointer border-0 bg-transparent p-0"
            style={{
              left: link.localX,
              top: link.localY,
              width: link.localWidth,
              height: link.localHeight,
              zIndex: 2
            }}
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onInternalLink(link.targetPageIndex)
            }}
          />
        ))}
      </PagePointerProvider>
    </div>
  )
}

/**
 * Readonly visual PDF layer under Excalidraw. EmbedPDF SelectionLayer is
 * hittable; the host gates Excalidraw pass-through so elements stay above text.
 * Only mounts canvases for pages currently tracked by the pool.
 *
 * Camera updates are imperative (`applyCamera`) so pan/zoom does not re-render
 * React — only CSS transform + culling when the visible page set changes.
 */
export const PdfLayer = forwardRef<PdfLayerHandle, PdfLayerProps>(function PdfLayer(
  { layout, pool, doc, documentId, onInternalLink },
  ref
) {
  const [visible, setVisible] = useState<number[]>([])
  const [linksByPage, setLinksByPage] = useState<Record<number, PdfLinkHit[]>>({})
  const [, setTick] = useState(0)

  const worldDivRef = useRef<HTMLDivElement>(null)
  const hitHostRef = useRef<HTMLDivElement>(null)
  const visibleRef = useRef<number[]>([])
  const syncGenRef = useRef(0)
  const linkGenRef = useRef(0)
  const linksByPageRef = useRef<Record<number, PdfLinkHit[]>>({})
  const lastCameraRef = useRef<CameraState | null>(null)

  const layoutRef = useRef(layout)
  const poolRef = useRef(pool)
  const docRef = useRef(doc)
  layoutRef.current = layout
  poolRef.current = pool
  docRef.current = doc
  linksByPageRef.current = linksByPage

  const applyCamera = useCallback((camera: CameraState) => {
    lastCameraRef.current = camera

    const world = worldDivRef.current
    if (world) {
      const { scrollX, scrollY, zoom } = camera
      world.style.transform = `translate(${scrollX * zoom}px, ${scrollY * zoom}px) scale(${zoom})`
    }

    const currentLayout = layoutRef.current
    const currentPool = poolRef.current

    const aabb = worldAABBFromCamera(
      camera.scrollX,
      camera.scrollY,
      camera.zoom,
      camera.viewportWidth,
      camera.viewportHeight
    )
    const buffer = visibilityBuffer(camera.viewportWidth, camera.viewportHeight, camera.zoom)
    const queried = currentLayout.queryVisible(aabb, buffer)
    const next = trimVisibleToCap(queried, currentPool.capacity, camera, (pageIndex) => {
      const page = currentLayout.pages[pageIndex]
      if (!page) return undefined
      return page.y + page.height / 2
    })

    if (visibleEqual(visibleRef.current, next)) return

    visibleRef.current = next
    setVisible(next)

    const gen = ++syncGenRef.current
    void (async () => {
      await currentPool.syncVisible(next)
      if (gen === syncGenRef.current) setTick((t) => t + 1)
    })()
  }, [])

  const setSearchHit = useCallback((hit: SearchMatch | null) => {
    const host = hitHostRef.current
    if (!host) return
    host.replaceChildren()
    if (!hit) return

    const layout = layoutRef.current
    const page = layout.pages[hit.pageIndex]
    if (!page) return

    // Search rects are native PDF page space; layout may be world-scaled.
    const s = layout.scale
    for (const rect of hit.rects) {
      const el = document.createElement('div')
      el.dataset.testid = 'pdf-search-hit'
      el.style.position = 'absolute'
      el.style.left = `${page.x + rect.x * s}px`
      el.style.top = `${page.y + rect.y * s}px`
      el.style.width = `${rect.width * s}px`
      el.style.height = `${rect.height * s}px`
      el.style.backgroundColor = 'rgba(255, 200, 0, 0.45)'
      el.style.pointerEvents = 'none'
      host.appendChild(el)
    }
  }, [])

  const findLinkAt = useCallback((sceneX: number, sceneY: number) => {
    const all: PdfLinkHit[] = []
    for (const hits of Object.values(linksByPageRef.current)) {
      all.push(...hits)
    }
    return findPdfLinkAt(all, sceneX, sceneY)
  }, [])

  useImperativeHandle(ref, () => ({ applyCamera, setSearchHit, findLinkAt }), [
    applyCamera,
    setSearchHit,
    findLinkAt
  ])

  useEffect(() => {
    const unsubPool = pool.subscribe(() => setTick((t) => t + 1))
    return () => {
      unsubPool()
    }
  }, [pool])

  // Session / pool identity changed — re-cull with last camera if any.
  useEffect(() => {
    visibleRef.current = []
    setLinksByPage({})
    linksByPageRef.current = {}
    const cam = lastCameraRef.current
    if (cam) applyCamera(cam)
  }, [layout, pool, doc, documentId, applyCamera])

  // Fetch internal LINK annots for newly visible pages (skip already cached).
  useEffect(() => {
    const gen = ++linkGenRef.current
    const currentLayout = layoutRef.current
    const currentDoc = docRef.current
    const scale = currentLayout.scale
    const cached = linksByPageRef.current

    const missing = visible.filter((i) => cached[i] === undefined)
    if (missing.length === 0) return

    let cancelled = false
    void (async () => {
      const additions: Record<number, PdfLinkHit[]> = {}
      for (const pageIndex of missing) {
        const page = currentLayout.pages[pageIndex]
        if (!page) {
          additions[pageIndex] = []
          continue
        }
        try {
          additions[pageIndex] = await loadPageLinks(currentDoc, pageIndex, page, scale)
        } catch {
          // Leave uncached so a later visible pass can retry.
          if (cancelled || gen !== linkGenRef.current) return
          continue
        }
        if (cancelled || gen !== linkGenRef.current) return
      }
      if (cancelled || gen !== linkGenRef.current) return
      setLinksByPage((prev) => ({ ...prev, ...additions }))
    })()

    return () => {
      cancelled = true
    }
  }, [visible, documentId, layout, doc])

  const pageIndices = new Set([...visible, ...pool.getSlots().map((s) => s.pageIndex)])

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ zIndex: 0 }}
    >
      <div
        ref={worldDivRef}
        className="absolute left-0 top-0 origin-top-left will-change-transform"
      >
        {[...pageIndices].map((pageIndex) => {
          const page = layout.pages[pageIndex]
          if (!page) return null
          return (
            <PageSlotView
              key={pageIndex}
              page={page}
              slot={pool.getSlot(pageIndex)}
              documentId={documentId}
              scale={layout.scale}
              cameraRef={lastCameraRef}
              links={linksByPage[pageIndex] ?? []}
              onInternalLink={onInternalLink}
            />
          )
        })}
        <div
          ref={hitHostRef}
          className="pointer-events-none absolute left-0 top-0 h-0 w-0 overflow-visible"
        />
      </div>
    </div>
  )
})
