import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  newElementWith,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue
} from '@excalidraw/excalidraw/types'
import { readFile } from '@renderer/integrations/fs'
import { setActivePageJump } from '@renderer/lib/pdf-canvas/active-page-jump'
import { setActiveSessionFlush } from '@renderer/lib/pdf-canvas/active-session-flush'
import {
  annotationsSignature,
  countCanvasStats,
  listAnnotations,
  type AnnotationListItem
} from '@renderer/lib/pdf-canvas/annotationList'
import {
  fileIdsFromElements,
  loadBinaryFiles,
  persistNewBinaryFiles
} from '@renderer/lib/pdf-canvas/attachments'
import { syncCanvasStats, syncReadingProgress } from '@renderer/lib/pdf-canvas/catalogWriteback'
import { isExcalidrawUiPointerTarget } from '@renderer/lib/pdf-canvas/excalidrawUiTarget'
import { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { PagePool } from '@renderer/lib/pdf-canvas/PagePool'
import {
  pageWorldScale,
  renderScaleForWorld,
  scaleSessionScene
} from '@renderer/lib/pdf-canvas/pageWorldScale'
import { PdfDocument } from '@renderer/lib/pdf-canvas/PdfDocument'
import {
  clearPdfNoteLinkForUi,
  createNoteFromHighlight,
  createWysiwygNote,
  findPdfNoteAt,
  fixDuplicatedPdfNotes,
  getNotePlateValue,
  idsDeletedWithHighlight,
  isPdfNote,
  isPdfNoteCenterHit,
  normalizePdfNote,
  NOTE_EMBED_LINK,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  repairUnvalidatedPdfNotes,
  syncPdfNoteArrows,
  withNotePlateValue
} from '@renderer/lib/pdf-canvas/pdfNotes'
import { loadOutline, type OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
// RAG parked — restore with enqueue in open effect (see src/main/ai/index.ts).
// import { buildTextChunks, extractPageTexts } from '@renderer/lib/pdf-canvas/pdfRag'
import {
  attachmentFileIdsFromSearchCaptures,
  createSearchCapture,
  createSearchCaptureFromHighlight,
  findPdfSearchCaptureAt,
  fixDuplicatedPdfSearchCaptures,
  getSearchCaptureQuery,
  isPdfSearchCapture,
  isPdfSearchCaptureCenterHit,
  normalizePdfSearchCapture,
  pastedHttpUrlForSearchCapture,
  SEARCH_CAPTURE_EMBED_LINK,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_LANDSCAPE,
  SEARCH_CAPTURE_PORTRAIT,
  SEARCH_CAPTURE_WIDTH,
  syncPdfSearchArrows
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { findSceneElementAt, holdsPdfTextPassOff } from '@renderer/lib/pdf-canvas/sceneHit'
import {
  clientToSceneCoords,
  findPdfHighlightAt,
  HIGHLIGHT_FILL,
  highlightGroupId,
  selectionToHighlightSkeletons,
  setHighlightGroupColor,
  withHighlightSkeletonColor
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import {
  readSession,
  SESSION_VERSION,
  writeSession,
  type SaveStatus,
  type SessionSnapshot
} from '@renderer/lib/pdf-canvas/session'
import { shouldApplyOpenResult } from '@renderer/lib/pdf-canvas/sessionOpen'
import { persistSignature, shouldMarkDirty } from '@renderer/lib/pdf-canvas/sessionPersist'
import {
  clearSessionPersistFreeze,
  isSessionPersistFrozen
} from '@renderer/lib/pdf-canvas/sessionPersistFreeze'
import { TextLayerPool } from '@renderer/lib/pdf-canvas/TextLayerPool'
import { ThumbPool } from '@renderer/lib/pdf-canvas/ThumbPool'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { useSettings } from '@renderer/stores/settings'
import { Globe, Search, StickyNote } from 'lucide-react'
import type { Value } from 'platejs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { BrowserChrome } from './BrowserChrome'
import { HighlightToolbar } from './HighlightToolbar'
import { NoteEmbed } from './NoteEmbed'
import { PageNavigator, type PageNavigatorHandle } from './PageNavigator'
import { PdfFindBar } from './PdfFindBar'
import { PdfLayer, type PdfLayerHandle } from './PdfLayer'
import { PdfSidebar, type PdfSidebarHandle } from './PdfSidebar'
import { SearchCaptureEmbed } from './SearchCaptureEmbed'
import { liveExcalidrawApi, setSelectionToolLocked } from './selectionTool'
import { usePdfFindBar } from './usePdfFindBar'
import { useSearchCaptureBrowser } from './useSearchCaptureBrowser'

import '@excalidraw/excalidraw/index.css'
import '@renderer/excalidraw.css'
import '@renderer/lib/pdf-canvas/textLayer.css'

const INITIAL_CAMERA: CameraState = {
  scrollX: 100,
  scrollY: 60,
  zoom: 2,
  viewportWidth: typeof window !== 'undefined' ? window.innerWidth : 1280,
  viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 800
}

const AUTOSAVE_DEBOUNCE_MS = 5_000

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  error: 'Error'
}

type RuntimeSession = {
  doc: PdfDocument
  layout: PageLayout
  pool: PagePool
  textPool: TextLayerPool
  thumbPool: ThumbPool
}

type PdfCanvasAppProps = {
  categoryId: string
  pdfId: string
}

/**
 * React state kept only when a re-render is required:
 * - session: mount PdfLayer / navigator / enable tools
 * - saveStatus: persistence chip
 * - place-note mode chip
 * - find bar open
 * - sidebar annotations list (id/kind/preview signature only)
 *
 * Everything else (camera, page, highlight chip, text pass-through) is ref + DOM.
 * Notes: Excalidraw embeddable + renderEmbeddable (no parallel HUD).
 * Text select: selection tool + miss → `.pdf-text-pass` (host PE-none → text layer).
 */
export function PdfCanvasApp({ categoryId, pdfId }: PdfCanvasAppProps) {
  const [, setLocation] = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const excalidrawHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<RuntimeSession | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  /** Last live scene for leave-flush after @next destroys get* / nulls onExcalidrawAPI. */
  const sceneCacheRef = useRef<unknown[] | null>(null)
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA)
  const pdfLayerRef = useRef<PdfLayerHandle>(null)
  const pageNavigatorRef = useRef<PageNavigatorHandle>(null)
  const pdfSidebarRef = useRef<PdfSidebarHandle>(null)
  const highlightToolbarRef = useRef<HTMLDivElement>(null)
  const activeHighlightIdRef = useRef<string | null>(null)
  /** Text selection awaiting a color click — not yet in the scene. */
  const pendingHighlightRef = useRef<ExcalidrawElementSkeleton[] | null>(null)
  const placeNoteModeRef = useRef(false)
  const placeBrowserModeRef = useRef(false)
  /** Keep PE pass-through until pointerup so mid-drag over a shape doesn't steal text select. */
  const textSelectGestureRef = useRef(false)
  const pdfTextPassRef = useRef(false)
  const currentPageRef = useRef(1)
  const saveStatusRef = useRef<SaveStatus>('saved')
  const saveChipRef = useRef<HTMLSpanElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const readyRef = useRef(false)
  const restoringRef = useRef(false)
  const openGenerationRef = useRef(0)
  const lastSavedSigRef = useRef('')
  const pendingSigRef = useRef('')
  const persistedAttachmentIdsRef = useRef(new Set<string>())
  /** Note ids Excalidraw has already validated (may have link stripped for UI). */
  const noteIdsRef = useRef(new Set<string>())
  /** Live Plate edits not yet written to the Excalidraw scene (avoid updateScene per keystroke). */
  const pendingPlateByNoteIdRef = useRef(new Map<string, Value>())

  const showPdfOutline = useSettings((s) => s.showPdfOutline)

  const [session, setSession] = useState<RuntimeSession | null>(null)
  const [placeNoteMode, setPlaceNoteMode] = useState(false)
  const [placeBrowserMode, setPlaceBrowserMode] = useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([])
  const annotationsSigRef = useRef('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>(HIGHLIGHT_FILL)
  const [highlightToolbarPending, setHighlightToolbarPending] = useState(false)

  const initialData = useMemo(
    () => ({
      appState: {
        viewBackgroundColor: 'transparent',
        currentItemArrowType: 'sharp' as const,
        scrollX: INITIAL_CAMERA.scrollX,
        scrollY: INITIAL_CAMERA.scrollY,
        zoom: { value: INITIAL_CAMERA.zoom as NormalizedZoomValue }
      },
      elements: []
    }),
    []
  )

  const syncSaveChip = useCallback((next: SaveStatus) => {
    if (saveStatusRef.current === next) return
    saveStatusRef.current = next
    setSaveStatus(next)
    const chip = saveChipRef.current
    if (!chip) return
    chip.textContent = SAVE_STATUS_LABEL[next]
  }, [])

  const hideHighlightToolbar = useCallback(() => {
    activeHighlightIdRef.current = null
    pendingHighlightRef.current = null
    setHighlightToolbarPending(false)
    const toolbar = highlightToolbarRef.current
    if (toolbar) toolbar.style.display = 'none'
  }, [])

  /** Keep Excalidraw shortcuts (undo) working after text-select / toolbar clicks. */
  const focusCanvasRoot = useCallback(() => {
    if (apiRef.current?.getAppState().activeEmbeddable?.state === 'active') return
    // Color/toolbar buttons steal focus after click — refocus on next frame.
    requestAnimationFrame(() => {
      containerRef.current?.focus({ preventScroll: true })
    })
  }, [])

  const setPdfTextPass = useCallback((on: boolean) => {
    if (pdfTextPassRef.current === on) return
    pdfTextPassRef.current = on
    containerRef.current?.classList.toggle('pdf-text-pass', on)
  }, [])

  const clearActiveEmbeddable = useCallback(() => {
    apiRef.current?.updateScene({
      appState: { activeEmbeddable: null }
    })
  }, [])

  const {
    browserChromeRef,
    zoomPercentRef,
    zoomIn,
    zoomOut,
    resizeActiveBrowser,
    isBrowsing,
    syncActiveBrowserBounds,
    openSearchBrowser,
    deactivateSearchBrowser,
    disposeBrowser
  } = useSearchCaptureBrowser({
    apiRef,
    containerRef,
    excalidrawHostRef,
    persistedAttachmentIdsRef,
    dirtyRef,
    syncSaveChip,
    clearActiveEmbeddable
  })

  const positionHighlightToolbar = useCallback(() => {
    const toolbar = highlightToolbarRef.current
    const api = apiRef.current
    const container = containerRef.current
    if (!toolbar || !api || !container) return

    const pending = pendingHighlightRef.current
    const highlightId = activeHighlightIdRef.current

    let sceneX: number
    let sceneY: number

    if (pending && pending.length > 0) {
      const first = pending[0]!
      sceneX = (first.x ?? 0) + (typeof first.width === 'number' ? first.width / 2 : 0)
      sceneY = first.y ?? 0
    } else if (highlightId) {
      const highlight = api.getSceneElements().find((el) => el.id === highlightId)
      if (!highlight || highlight.isDeleted) {
        hideHighlightToolbar()
        return
      }
      sceneX = highlight.x + highlight.width / 2
      sceneY = highlight.y
    } else {
      return
    }

    const appState = api.getAppState()
    const topCenter = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState)
    const bounds = container.getBoundingClientRect()
    toolbar.style.left = `${topCenter.x - bounds.left}px`
    toolbar.style.top = `${topCenter.y - bounds.top - 8}px`
    toolbar.style.display = 'flex'
  }, [hideHighlightToolbar])

  const showHighlightToolbar = useCallback(
    (highlightId: string) => {
      pendingHighlightRef.current = null
      setHighlightToolbarPending(false)
      activeHighlightIdRef.current = highlightId
      const el = apiRef.current?.getSceneElements().find((e) => e.id === highlightId)
      if (el) setActiveHighlightColor(el.backgroundColor || HIGHLIGHT_FILL)
      positionHighlightToolbar()
    },
    [positionHighlightToolbar]
  )

  const showPendingHighlightToolbar = useCallback(
    (skeletons: ExcalidrawElementSkeleton[]) => {
      activeHighlightIdRef.current = null
      pendingHighlightRef.current = skeletons
      setHighlightToolbarPending(true)
      positionHighlightToolbar()
    },
    [positionHighlightToolbar]
  )

  const pushCamera = useCallback(
    (patch: Partial<CameraState>) => {
      const next = { ...cameraRef.current, ...patch }
      cameraRef.current = next
      pdfLayerRef.current?.applyCamera(next)

      const layout = sessionRef.current?.layout
      if (layout) {
        const index = layout.pageIndexForCamera(next)
        const page1Based = index != null ? index + 1 : 1
        if (page1Based !== currentPageRef.current) {
          currentPageRef.current = page1Based
          pageNavigatorRef.current?.setCurrentPage(page1Based)
          pdfSidebarRef.current?.setActivePage(page1Based)
        }
      }

      if (activeHighlightIdRef.current || pendingHighlightRef.current) {
        positionHighlightToolbar()
      }
      if (isBrowsing()) {
        syncActiveBrowserBounds()
      }
    },
    [positionHighlightToolbar, isBrowsing, syncActiveBrowserBounds]
  )

  /** List identity/preview only — skip setState when signature unchanged. */
  const syncAnnotations = useCallback((elements: Parameters<typeof listAnnotations>[0]) => {
    const layout = sessionRef.current?.layout
    const files = apiRef.current?.getFiles() ?? {}
    const items = listAnnotations(elements, {
      pageIndexAt: (x, y) => layout?.pageIndexAtWorldPoint(x, y) ?? null,
      fileDataURL: (fileId) => {
        const f = files[fileId]
        return typeof f?.dataURL === 'string' ? f.dataURL : null
      }
    })
    const sig = annotationsSignature(items)
    if (sig === annotationsSigRef.current) return
    annotationsSigRef.current = sig
    setAnnotations(items)
  }, [])

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current != null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  /** Persist notes/captures with link restored (UI may have stripped it after embed validate). */
  const sceneElementsForPersist = useCallback(() => {
    const api = liveExcalidrawApi(apiRef.current)
    const pending = pendingPlateByNoteIdRef.current
    const live = api
      ? api
          .getSceneElements()
          .filter((el) => !el.isDeleted)
          .map((el) => {
            let normalized = normalizePdfNote(el)
            normalized = normalizePdfSearchCapture(normalized)
            return normalized
          })
      : null
    if (live) sceneCacheRef.current = live
    const base = live ?? (sceneCacheRef.current as typeof live)
    if (!base) return null
    return base.map((el) => {
      const plate = pending.get(el.id)
      // ponytail: merge unsynced Plate edits so autosave/flush see live text
      return plate !== undefined ? withNotePlateValue(el, plate) : el
    })
  }, [])

  /**
   * After Excalidraw validates note embeds (needs link once), clear note links so
   * the canvas link icon / open-in-new-tab hit-test disappear. Capture NEVER —
   * normalize on persist restores the link for the next open.
   *
   * Search captures with a screenshot are native `image` elements (no embed link).
   * Placeholders keep their link; do not strip them here.
   */
  const stripPdfNoteLinksAfterValidate = useCallback(() => {
    const api = liveExcalidrawApi(apiRef.current)
    if (!api) return
    const elements = api.getSceneElements()
    let changed = false
    const next = elements.map((el) => {
      const cleared = clearPdfNoteLinkForUi(el)
      if (cleared !== el) changed = true
      return cleared
    })
    if (!changed) return
    // Excalidraw gates embed pointer-events on activeEmbeddable.element === el
    // (reference). Replacing elements must refresh that ref or toolbar clicks
    // fall through to the canvas and exit edit.
    const active = api.getAppState().activeEmbeddable
    const activeId = active?.state === 'active' ? (active.element?.id ?? null) : null
    const activeEl = activeId ? next.find((el) => el.id === activeId && !el.isDeleted) : null
    api.updateScene({
      elements: next,
      ...(activeEl
        ? {
            appState: {
              activeEmbeddable: {
                element: activeEl as typeof activeEl & { isDeleted: false },
                state: 'active'
              }
            }
          }
        : {}),
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [])

  const queueStripPdfNoteLinks = useCallback(() => {
    // Let Excalidraw run embed URL validation (requires link) before clearing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stripPdfNoteLinksAfterValidate()
      })
    })
  }, [stripPdfNoteLinksAfterValidate])

  const currentPersistSignature = useCallback((): string | null => {
    const elements = sceneElementsForPersist()
    if (!elements) return null
    const cam = cameraRef.current
    return persistSignature(JSON.parse(JSON.stringify(elements)) as unknown[], cam)
  }, [sceneElementsForPersist])

  const buildSnapshot = useCallback((): SessionSnapshot | null => {
    const elements = sceneElementsForPersist()
    if (!elements || !readyRef.current) return null
    const cam = cameraRef.current
    return {
      version: SESSION_VERSION,
      docId: pdfId,
      updatedAt: new Date().toISOString(),
      camera: {
        scrollX: cam.scrollX,
        scrollY: cam.scrollY,
        zoom: cam.zoom
      },
      elements: JSON.parse(JSON.stringify(elements)) as unknown[]
    }
  }, [pdfId, sceneElementsForPersist])

  const writeSnapshotNow = useCallback(async (): Promise<boolean> => {
    if (isSessionPersistFrozen()) return false
    if (!readyRef.current || !dirtyRef.current) {
      syncSaveChip('saved')
      return true
    }
    const snapshot = buildSnapshot()
    if (!snapshot) return true
    const sig = persistSignature(snapshot.elements, snapshot.camera)

    syncSaveChip('saving')
    try {
      await writeSession(pdfId, snapshot)
      dirtyRef.current = false
      pendingSigRef.current = ''
      lastSavedSigRef.current = sig
      syncSaveChip('saved')
      const totalPages = sessionRef.current?.doc.pageCount ?? 0
      syncReadingProgress(categoryId, pdfId, currentPageRef.current, totalPages)
      syncCanvasStats(
        categoryId,
        pdfId,
        snapshot.elements as Parameters<typeof countCanvasStats>[0]
      )
      return true
    } catch (err) {
      console.error(err)
      syncSaveChip('error')
      return false
    }
  }, [buildSnapshot, categoryId, pdfId, syncSaveChip])

  const markUnsaved = useCallback(() => {
    if (!readyRef.current || restoringRef.current) return
    const sig = currentPersistSignature()
    if (sig == null) return

    const gate = shouldMarkDirty({
      sig,
      lastSaved: lastSavedSigRef.current,
      pending: pendingSigRef.current,
      dirty: dirtyRef.current
    })

    if (gate.action === 'noop') return

    if (gate.action === 'clear') {
      dirtyRef.current = false
      pendingSigRef.current = ''
      clearSaveTimer()
      syncSaveChip('saved')
      return
    }

    dirtyRef.current = true
    pendingSigRef.current = gate.pending
    syncSaveChip('unsaved')
    clearSaveTimer()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void writeSnapshotNow()
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [clearSaveTimer, currentPersistSignature, syncSaveChip, writeSnapshotNow])

  const flushSave = useCallback(async () => {
    clearSaveTimer()
    if (!dirtyRef.current) return
    await writeSnapshotNow()
  }, [clearSaveTimer, writeSnapshotNow])

  const getLayout = useCallback(() => sessionRef.current?.layout ?? null, [])

  const {
    findOpen,
    findBarRef,
    toggleFind,
    closeFind,
    handleFindQueryChange,
    goNextMatch,
    goPrevMatch
  } = usePdfFindBar({
    doc: session?.doc ?? null,
    apiRef,
    cameraRef,
    pdfLayerRef,
    getLayout,
    pushCamera,
    markUnsaved
  })

  const destroyRuntimeSession = useCallback(async () => {
    const prev = sessionRef.current
    if (!prev) return
    disposeBrowser()
    // Drop React/session refs before tearing down the worker so a stale PdfLayer
    // syncVisible cannot call getPage on a destroyed transport.
    sessionRef.current = null
    setSession(null)
    setOutline([])
    prev.pool.destroy()
    prev.textPool.destroy()
    prev.thumbPool.destroy()
    await prev.doc.destroy()
  }, [disposeBrowser])

  const clearScene = useCallback(() => {
    apiRef.current?.updateScene({
      elements: [],
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      const { width, height } = entry.contentRect
      pushCamera({
        viewportWidth: width,
        viewportHeight: height
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [pushCamera])

  useEffect(() => {
    const generation = ++openGenerationRef.current
    let cancelled = false
    clearSessionPersistFreeze()
    readyRef.current = false
    dirtyRef.current = false
    lastSavedSigRef.current = ''
    pendingSigRef.current = ''
    persistedAttachmentIdsRef.current = new Set()
    noteIdsRef.current = new Set()
    pendingPlateByNoteIdRef.current = new Map()
    annotationsSigRef.current = ''
    setAnnotations([])
    clearSaveTimer()
    syncSaveChip('saved')
    setLoadError(null)

    const open = async () => {
      await destroyRuntimeSession()
      clearScene()

      try {
        const [bytes, snapshot] = await Promise.all([readFile(`${pdfId}.pdf`), readSession(pdfId)])
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) return

        if (!bytes) {
          setLoadError('PDF file not found')
          return
        }

        // Copy into a fresh ArrayBuffer — pdf.js may transfer the buffer to the worker.
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer

        const doc = await PdfDocument.open(ab)
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
          await doc.destroy()
          return
        }

        const { scale: worldScale, sizes: worldSizes } = pageWorldScale(doc.pageSizes)
        const layout = new PageLayout(worldSizes, undefined, worldScale)
        const pool = new PagePool(doc, { renderScale: renderScaleForWorld(worldScale) })
        const textPool = new TextLayerPool(doc, { scale: worldScale })
        const thumbPool = new ThumbPool(doc)
        const next: RuntimeSession = { doc, layout, pool, textPool, thumbPool }
        sessionRef.current = next
        setSession(next)

        // Outline for sidebar. RAG enqueue parked — see src/main/ai/index.ts.
        // void (async () => {
        //   try {
        //     const nodes = await loadOutline(doc)
        //     if (shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
        //       setOutline(nodes)
        //     }
        //     const pageTexts = await extractPageTexts(doc)
        //     const { chunks, fingerprint } = buildTextChunks(pageTexts, nodes)
        //     const title = usePdfs
        //       .getState()
        //       .categories.find((c) => c.id === categoryId)
        //       ?.pdfs.find((p) => p.id === pdfId)?.name
        //     await enqueueRagIndex({ pdfId, fingerprint, chunks, title })
        //   } catch (err) {
        //     console.error('RAG enqueue failed', err)
        //   }
        // })()
        void (async () => {
          try {
            const nodes = await loadOutline(doc)
            if (shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
              setOutline(nodes)
            }
          } catch (err) {
            console.error('Outline load failed', err)
          }
        })()

        // v1 sessions store native PDF coords; v2+ are already world-normalized.
        const migrated =
          snapshot != null
            ? snapshot.version === 1
              ? scaleSessionScene(snapshot.elements, snapshot.camera, worldScale)
              : { elements: snapshot.elements, camera: snapshot.camera }
            : null
        const cam = migrated?.camera
        const scrollX = cam?.scrollX ?? INITIAL_CAMERA.scrollX
        const scrollY = cam?.scrollY ?? INITIAL_CAMERA.scrollY
        const zoom = (cam?.zoom ?? INITIAL_CAMERA.zoom) as NormalizedZoomValue
        const elements =
          migrated?.elements && Array.isArray(migrated.elements)
            ? syncPdfSearchArrows(
                syncPdfNoteArrows(
                  (
                    migrated.elements as ReturnType<ExcalidrawImperativeAPI['getSceneElements']>
                  ).map((el) => normalizePdfSearchCapture(normalizePdfNote(el)))
                ).elements
              ).elements
            : []

        const attachmentIds = [
          ...fileIdsFromElements(elements),
          ...attachmentFileIdsFromSearchCaptures(elements)
        ]
        const binaryFiles = await loadBinaryFiles(attachmentIds)
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) return
        for (const f of binaryFiles) persistedAttachmentIdsRef.current.add(f.id)

        restoringRef.current = true
        pushCamera({ scrollX, scrollY, zoom })

        const applyScene = () => {
          const api = apiRef.current
          if (!api) return false
          if (binaryFiles.length > 0) api.addFiles(binaryFiles)
          api.updateScene({
            elements,
            appState: {
              scrollX,
              scrollY,
              zoom: { value: zoom },
              viewBackgroundColor: 'transparent'
            },
            captureUpdate: CaptureUpdateAction.NEVER
          })
          return true
        }

        if (!applyScene()) {
          await new Promise<void>((resolve) => {
            let tries = 0
            const tick = () => {
              if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
                resolve()
                return
              }
              if (applyScene() || tries++ > 40) {
                resolve()
                return
              }
              requestAnimationFrame(tick)
            }
            requestAnimationFrame(tick)
          })
        }

        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) return

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) return

        // Seed before strip so paste-repair won't rematerialize restored embeds.
        noteIdsRef.current = new Set(
          elements.filter((el) => isPdfNote(el) && !el.isDeleted).map((el) => el.id)
        )

        // Validate embeds (needs link) then clear so canvas link icon disappears.
        stripPdfNoteLinksAfterValidate()

        syncAnnotations(elements)
        syncCanvasStats(categoryId, pdfId, elements)

        restoringRef.current = false
        readyRef.current = true
        dirtyRef.current = false
        pendingSigRef.current = ''
        lastSavedSigRef.current =
          currentPersistSignature() ?? persistSignature(elements, { scrollX, scrollY, zoom })
        syncSaveChip('saved')
      } catch (err) {
        console.error(err)
        setLoadError(err instanceof Error ? err.message : 'Failed to open PDF')
      }
    }

    void open()

    return () => {
      cancelled = true
      readyRef.current = false
      clearSaveTimer()
    }
  }, [
    categoryId,
    clearSaveTimer,
    clearScene,
    currentPersistSignature,
    destroyRuntimeSession,
    pdfId,
    pushCamera,
    stripPdfNoteLinksAfterValidate,
    syncAnnotations,
    syncSaveChip
  ])

  // Flush + tear down when leaving the route (sidebar nav, etc.).
  useEffect(() => {
    return () => {
      clearSaveTimer()
      // Frozen after ErrorBoundary crash — do not flush empty/corrupt scene over disk.
      // Do not require readyRef — open-effect cleanup may clear it while dirty still holds
      // pending Plate; still merge via sceneElementsForPersist.
      // @next: onExcalidrawAPI(null) runs before this cleanup (get* already stubbed) —
      // sceneElementsForPersist falls back to sceneCacheRef.
      if (dirtyRef.current && !isSessionPersistFrozen()) {
        const elements = sceneElementsForPersist()
        if (elements) {
          const cam = cameraRef.current
          const snapshot: SessionSnapshot = {
            version: SESSION_VERSION,
            docId: pdfId,
            updatedAt: new Date().toISOString(),
            camera: {
              scrollX: cam.scrollX,
              scrollY: cam.scrollY,
              zoom: cam.zoom
            },
            elements: JSON.parse(JSON.stringify(elements)) as unknown[]
          }
          void writeSession(pdfId, snapshot)
          const totalPages = sessionRef.current?.doc.pageCount ?? 0
          syncReadingProgress(categoryId, pdfId, currentPageRef.current, totalPages)
          syncCanvasStats(
            categoryId,
            pdfId,
            snapshot.elements as Parameters<typeof countCanvasStats>[0]
          )
        }
      }
      disposeBrowser()
      const current = sessionRef.current
      if (!current) return
      sessionRef.current = null
      current.pool.destroy()
      current.textPool.destroy()
      current.thumbPool.destroy()
      void current.doc.destroy()
    }
  }, [categoryId, clearSaveTimer, disposeBrowser, pdfId, sceneElementsForPersist])

  useEffect(() => {
    if (!session) return
    pdfLayerRef.current?.applyCamera(cameraRef.current)
    const index = session.layout.pageIndexForCamera(cameraRef.current)
    const page1Based = index != null ? index + 1 : 1
    currentPageRef.current = page1Based
    pageNavigatorRef.current?.setCurrentPage(page1Based)
  }, [session])

  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
      void flushSave()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [flushSave])

  useEffect(() => {
    setActiveSessionFlush(flushSave)
    return () => setActiveSessionFlush(null)
  }, [flushSave])

  // Flush before in-app <a> navigations (breadcrumbs, etc.) leave this PDF.
  // Hash-router (file://) Links use href="#/…"; bare "#frag" is not a route change.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!dirtyRef.current) return
      if (event.defaultPrevented) return
      if (event.button !== 0) return
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

      const el = event.target
      if (!(el instanceof Element)) return
      const anchor = el.closest('a[href]')
      if (!(anchor instanceof HTMLAnchorElement)) return

      const href = anchor.getAttribute('href')
      if (!href || href.startsWith('http') || href.startsWith('mailto:')) return

      if (href.startsWith('#')) {
        if (!href.startsWith('#/')) return
        const next = href.slice(1) // `/path`
        const current = location.hash.replace(/^#/, '') || '/'
        if (next === current) return
        event.preventDefault()
        event.stopImmediatePropagation()
        void flushSave().then(() => {
          setLocation(next)
        })
        return
      }

      const url = new URL(href, window.location.href)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        return
      }

      event.preventDefault()
      event.stopImmediatePropagation()
      void flushSave().then(() => {
        setLocation(url.pathname + url.search + url.hash)
      })
    }

    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [flushSave, setLocation])

  const handleScrollChange = useCallback(
    (scrollX: number, scrollY: number, zoom: { value: number }) => {
      pushCamera({
        scrollX,
        scrollY,
        zoom: zoom.value
      })
      markUnsaved()
    },
    [markUnsaved, pushCamera]
  )

  const handleExcalidrawChange = useCallback(
    (
      _elements: unknown,
      appState: {
        activeEmbeddable?: { element?: { id: string } | null; state: string } | null
      },
      files: BinaryFiles
    ) => {
      if (files && Object.keys(files).length > 0) {
        void persistNewBinaryFiles(files, persistedAttachmentIdsRef.current)
      }

      if (!restoringRef.current) {
        const api = liveExcalidrawApi(apiRef.current)
        if (api) {
          // Undo / delete: drop highlight toolbar when the active rect is gone.
          const hlId = activeHighlightIdRef.current
          if (hlId) {
            const stillThere = api.getSceneElements().some((el) => el.id === hlId && !el.isDeleted)
            if (!stillThere) hideHighlightToolbar()
          }

          // Host arrows always — delete cascade + undo revive must not skip on embed hover spam.
          // IncludingDeleted: soft-deleted arrows stay in the store for revive after Ctrl+Z.
          let scene = api.getSceneElementsIncludingDeleted()
          // ponytail: never host-updateScene mid-draw — fights Excalidraw's in-progress
          // linear element (bindings to notes stay intact; we just don't rewrite the scene).
          const drawing =
            api.getAppState().newElement != null || api.getAppState().multiElement != null
          if (drawing) {
            markUnsaved()
            return
          }

          // ponytail: never migrateBoundArrows on live onChange — mid-draw endBinding
          // to a note embeddable + updateScene → Maximum update depth. Legacy migrate on open.
          const syncedNotes = syncPdfNoteArrows(scene, { migrateBoundArrows: false })
          if (syncedNotes.changed) {
            scene = syncedNotes.elements
            api.updateScene({
              elements: scene,
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }
          const syncedCaptures = syncPdfSearchArrows(scene)
          if (syncedCaptures.changed) {
            scene = syncedCaptures.elements
            api.updateScene({
              elements: scene,
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }

          // Excalidraw setStates activeEmbeddable "hover" on every pointermove over the
          // note center third (no equality guard) → onChange spam. Skip the rest.
          if (appState.activeEmbeddable?.state === 'hover') {
            if (syncedNotes.changed || syncedCaptures.changed) markUnsaved()
            return
          }

          const repairedNotes = repairUnvalidatedPdfNotes(scene, noteIdsRef.current)
          noteIdsRef.current = repairedNotes.knownIds
          if (repairedNotes.changed) {
            scene = repairedNotes.elements
            api.updateScene({
              elements: scene,
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }

          // onDuplicate restores link without rematerializing (changed=false).
          // Still strip note links after validate so the canvas link icon stays hidden.
          // Search captures keep their link (sticky embedsValidationStatus).
          if (scene.some((el) => !el.isDeleted && el.link && isPdfNote(el))) {
            queueStripPdfNoteLinks()
          }
          // Skip list sync while typing — pending plate lives in a ref, not the scene.
          // On exit edit, flush pending → scene then sync the sidebar.
          const active = api.getAppState().activeEmbeddable
          const editingNote =
            active?.state === 'active' && active.element != null && isPdfNote(active.element)

          // Browser lifetime is host-owned (center-click / Escape / outside).
          if (editingNote && isBrowsing()) {
            void deactivateSearchBrowser()
          }

          if (isBrowsing()) {
            syncActiveBrowserBounds()
          }

          if (!editingNote) {
            const pending = pendingPlateByNoteIdRef.current
            if (pending.size > 0) {
              const merged = scene.map((el) => {
                const v = pending.get(el.id)
                return v !== undefined ? withNotePlateValue(el, v) : el
              })
              pending.clear()
              api.updateScene({
                elements: merged,
                captureUpdate: CaptureUpdateAction.NEVER
              })
              syncAnnotations(merged)
            } else {
              syncAnnotations(scene)
            }
          }
        }
      }
      markUnsaved()
    },
    [
      deactivateSearchBrowser,
      hideHighlightToolbar,
      isBrowsing,
      markUnsaved,
      queueStripPdfNoteLinks,
      syncActiveBrowserBounds,
      syncAnnotations
    ]
  )

  const exitPlaceModes = useCallback(() => {
    placeNoteModeRef.current = false
    placeBrowserModeRef.current = false
    setPlaceNoteMode(false)
    setPlaceBrowserMode(false)
    setSelectionToolLocked(apiRef.current, false)
  }, [])

  const enterPlaceMode = useCallback(
    (kind: 'note' | 'browser') => {
      const isNote = kind === 'note'
      placeNoteModeRef.current = isNote
      placeBrowserModeRef.current = !isNote
      setPlaceNoteMode(isNote)
      setPlaceBrowserMode(!isNote)
      hideHighlightToolbar()
      clearActiveEmbeddable()
      setSelectionToolLocked(apiRef.current, true)
      setPdfTextPass(false)
    },
    [clearActiveEmbeddable, hideHighlightToolbar, setPdfTextPass]
  )

  const togglePlaceNoteMode = useCallback(() => {
    if (placeNoteModeRef.current) exitPlaceModes()
    else enterPlaceMode('note')
  }, [enterPlaceMode, exitPlaceModes])

  const togglePlaceBrowserMode = useCallback(() => {
    if (placeBrowserModeRef.current) exitPlaceModes()
    else enterPlaceMode('browser')
  }, [enterPlaceMode, exitPlaceModes])

  const updateNotePlateValue = useCallback(
    (noteId: string, value: Value) => {
      const pending = pendingPlateByNoteIdRef.current
      if (pending.get(noteId) === value) return
      // Plate may fire onChange on mount with the same Value — skip.
      if (pending.get(noteId) === undefined) {
        const note = apiRef.current?.getSceneElements().find((el) => el.id === noteId)
        if (!note) return
        if (note.customData?.plateValue === value) return
      }
      // Keep edits in a ref — updateScene per keystroke re-renders Excalidraw + parent.
      pending.set(noteId, value)
      markUnsaved()
    },
    [markUnsaved]
  )

  // Stable prop — avoid new function identity on every PdfCanvasApp render.
  const renderEmbeddable = useCallback(
    (
      element: Parameters<typeof getNotePlateValue>[0],
      appState: { activeEmbeddable?: { element?: { id: string } | null; state: string } | null }
    ) => {
      const editing =
        appState.activeEmbeddable?.element?.id === element.id &&
        appState.activeEmbeddable?.state === 'active'

      if (isPdfSearchCapture(element)) {
        return <SearchCaptureEmbed captureId={element.id} query={getSearchCaptureQuery(element)} />
      }

      if (!isPdfNote(element)) return null
      return (
        <NoteEmbed
          noteId={element.id}
          plateValue={getNotePlateValue(element)}
          editing={editing}
          onValueChange={updateNotePlateValue}
          onExitEdit={clearActiveEmbeddable}
        />
      )
    },
    [clearActiveEmbeddable, updateNotePlateValue]
  )

  const pageCount = session?.doc.pageCount ?? 0

  const goToPage = useCallback(
    (pageIndex0: number) => {
      const layout = sessionRef.current?.layout
      const api = apiRef.current
      if (!layout || !api) return

      const clamped = Math.min(layout.pages.length - 1, Math.max(0, pageIndex0))
      const target = layout.scrollForPageCenter(clamped, cameraRef.current)
      if (!target) return

      pushCamera({ scrollY: target.scrollY })
      api.updateScene({
        appState: {
          scrollY: target.scrollY
        }
      })
      markUnsaved()
    },
    [markUnsaved, pushCamera]
  )

  const goToAnnotation = useCallback(
    (id: string) => {
      const api = apiRef.current
      const layout = sessionRef.current?.layout
      if (!api || !layout) return

      const el = api.getSceneElements().find((e) => e.id === id && !e.isDeleted)
      if (!el) return

      const cam = cameraRef.current
      const z = cam.zoom || 1
      const cx = el.x + el.width / 2
      const cy = el.y + el.height / 2
      const scrollX = -cx + cam.viewportWidth / (2 * z)
      const scrollY = layout.scrollForWorldY(cy, cam).scrollY

      pushCamera({ scrollX, scrollY })
      api.updateScene({
        appState: {
          scrollX,
          scrollY
        }
      })
      markUnsaved()
    },
    [markUnsaved, pushCamera]
  )

  const goToPage1Based = useCallback(
    (page1Based: number) => {
      goToPage(page1Based - 1)
    },
    [goToPage]
  )

  useEffect(() => {
    setActivePageJump(goToPage1Based)
    return () => setActivePageJump(null)
  }, [goToPage1Based])

  const goPrevPage = useCallback(() => {
    const pageIndex0 = currentPageRef.current - 1
    goToPage(pageIndex0 - 1)
  }, [goToPage])

  const goNextPage = useCallback(() => {
    const pageIndex0 = currentPageRef.current - 1
    goToPage(pageIndex0 + 1)
  }, [goToPage])

  const handlePointerDown = useCallback(
    (_activeTool: unknown, pointerDownState: { origin: { x: number; y: number } }) => {
      const api = apiRef.current
      if (!api) return
      const { x: sceneX, y: sceneY } = pointerDownState.origin

      if (placeNoteModeRef.current) {
        const note = createWysiwygNote({
          x: sceneX - NOTE_WIDTH / 2,
          y: sceneY - NOTE_HEIGHT / 2
        })
        api.updateScene({
          elements: [...api.getSceneElements(), note],
          appState: {
            selectedElementIds: { [note.id]: true }
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
        exitPlaceModes()
        // Select only — edit via Excalidraw embed activate (click center).
        hideHighlightToolbar()
        queueStripPdfNoteLinks()
        markUnsaved()
        return
      }

      if (placeBrowserModeRef.current) {
        const capture = createSearchCapture({
          x: sceneX - SEARCH_CAPTURE_WIDTH / 2,
          y: sceneY - SEARCH_CAPTURE_HEIGHT / 2,
          query: '',
          url: 'https://www.google.com'
        })
        api.updateScene({
          elements: [...api.getSceneElements(), capture],
          appState: {
            selectedElementIds: { [capture.id]: true }
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY
        })
        exitPlaceModes()
        hideHighlightToolbar()
        queueStripPdfNoteLinks()
        markUnsaved()
        // Defer center+open past Excalidraw's pointer gesture (camera jump mid-down races drag).
        const captureId = capture.id
        queueMicrotask(() => {
          requestAnimationFrame(() => {
            const live = apiRef.current?.getSceneElements().find((e) => e.id === captureId)
            if (!live || !isPdfSearchCapture(live)) return
            goToAnnotation(live.id)
            void openSearchBrowser(live)
          })
        })
        return
      }

      const hit = findPdfHighlightAt(api.getSceneElements(), sceneX, sceneY)
      if (hit) {
        showHighlightToolbar(hit.id)
      } else {
        hideHighlightToolbar()
      }
    },
    [
      exitPlaceModes,
      goToAnnotation,
      hideHighlightToolbar,
      markUnsaved,
      openSearchBrowser,
      queueStripPdfNoteLinks,
      showHighlightToolbar
    ]
  )

  /** Commit pending text-selection skeletons into the scene. Returns first highlight id. */
  const commitPendingHighlight = useCallback(
    (color: string = HIGHLIGHT_FILL): string | null => {
      const api = apiRef.current
      const pending = pendingHighlightRef.current
      if (!api || !pending?.length) return null

      const colored = withHighlightSkeletonColor(pending, color)
      const newElements = convertToExcalidrawElements(colored)
      api.updateScene({
        elements: [...api.getSceneElements(), ...newElements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      window.getSelection()?.removeAllRanges()
      pendingHighlightRef.current = null
      setHighlightToolbarPending(false)

      const first = newElements[0]
      if (!first) return null

      activeHighlightIdRef.current = first.id
      setActiveHighlightColor(color)
      markUnsaved()
      focusCanvasRoot()
      return first.id
    },
    [focusCanvasRoot, markUnsaved]
  )

  const addArtifactFromHighlight = useCallback(
    (
      create: typeof createNoteFromHighlight | typeof createSearchCaptureFromHighlight,
      selectPred: typeof isPdfNote | typeof isPdfSearchCapture,
      opts?: { openBrowser?: boolean }
    ) => {
      const api = apiRef.current
      // Pending text selection: commit default-color highlight first, then artifact.
      if (pendingHighlightRef.current?.length && !activeHighlightIdRef.current) {
        if (!commitPendingHighlight()) return
      }

      const highlightId = activeHighlightIdRef.current
      if (!api || !highlightId) return

      const scene = api.getSceneElements()
      const highlight = scene.find((el) => el.id === highlightId)
      if (!highlight) return

      const { newElements } = create(highlight, scene)

      api.updateScene({
        elements: [...scene, ...newElements],
        appState: {
          selectedElementIds: Object.fromEntries(
            newElements.filter(selectPred).map((el) => [el.id, true])
          )
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })

      hideHighlightToolbar()
      queueStripPdfNoteLinks()
      markUnsaved()

      if (opts?.openBrowser) {
        const capture = newElements.find(isPdfSearchCapture)
        if (capture) {
          goToAnnotation(capture.id)
          void openSearchBrowser(capture)
        }
      }
    },
    [
      commitPendingHighlight,
      goToAnnotation,
      hideHighlightToolbar,
      markUnsaved,
      openSearchBrowser,
      queueStripPdfNoteLinks
    ]
  )

  const addNoteToActiveHighlight = useCallback(() => {
    addArtifactFromHighlight(createNoteFromHighlight, isPdfNote)
  }, [addArtifactFromHighlight])

  const addSearchCaptureToActiveHighlight = useCallback(() => {
    addArtifactFromHighlight(createSearchCaptureFromHighlight, isPdfSearchCapture, {
      openBrowser: true
    })
  }, [addArtifactFromHighlight])

  const copyActiveHighlightText = useCallback(() => {
    const pending = pendingHighlightRef.current
    if (pending?.length) {
      const text = pending[0]?.customData?.text
      if (typeof text === 'string' && text.trim()) {
        void navigator.clipboard.writeText(text)
        hideHighlightToolbar()
        window.getSelection()?.removeAllRanges()
      }
      return
    }

    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const highlight = api.getSceneElements().find((el) => el.id === highlightId)
    if (!highlight || highlight.isDeleted) return

    const text = highlight.customData?.text
    if (typeof text !== 'string' || !text.trim()) return

    void navigator.clipboard.writeText(text)
    hideHighlightToolbar()
  }, [hideHighlightToolbar])

  const removeActiveHighlight = useCallback(() => {
    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const scene = api.getSceneElements()
    const highlight = scene.find((el) => el.id === highlightId)
    if (!highlight || highlight.isDeleted) return

    const groupId = highlightGroupId(highlight)
    const toDelete = idsDeletedWithHighlight(scene, groupId)

    api.updateScene({
      elements: scene.map((el) =>
        toDelete.has(el.id)
          ? (newElementWith(el, {
              isDeleted: true
            } as Parameters<typeof newElementWith>[1]) as typeof el)
          : el
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    hideHighlightToolbar()
    markUnsaved()
    focusCanvasRoot()
  }, [focusCanvasRoot, hideHighlightToolbar, markUnsaved])

  const recolorActiveHighlight = useCallback(
    (color: string) => {
      const api = apiRef.current
      if (!api) return

      if (pendingHighlightRef.current?.length) {
        const id = commitPendingHighlight(color)
        if (id) showHighlightToolbar(id)
        else hideHighlightToolbar()
        return
      }

      const highlightId = activeHighlightIdRef.current
      if (!highlightId) return

      const scene = api.getSceneElements()
      const highlight = scene.find((el) => el.id === highlightId)
      if (!highlight || highlight.isDeleted) return

      api.updateScene({
        elements: setHighlightGroupColor(scene, highlightGroupId(highlight), color),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      setActiveHighlightColor(color)
      markUnsaved()
      focusCanvasRoot()
    },
    [
      commitPendingHighlight,
      focusCanvasRoot,
      hideHighlightToolbar,
      markUnsaved,
      showHighlightToolbar
    ]
  )

  useEffect(() => {
    const isWritableKeyTarget = (target: EventTarget | null): boolean => {
      const el = target instanceof HTMLElement ? target : null
      if (!el) return false
      const tag = el.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return true
      if (el.isContentEditable || el.closest('[contenteditable="true"]')) return true
      return false
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (placeNoteModeRef.current || placeBrowserModeRef.current) {
          exitPlaceModes()
          event.preventDefault()
          return
        }
        if (activeHighlightIdRef.current || pendingHighlightRef.current) {
          hideHighlightToolbar()
          window.getSelection()?.removeAllRanges()
          event.preventDefault()
        }
        return
      }

      // Cmd/Ctrl+A → Excalidraw select-all (not browser select-all on .textLayer).
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'a' || event.key === 'A') &&
        !event.altKey &&
        !event.shiftKey
      ) {
        if (isWritableKeyTarget(event.target)) return
        const api = apiRef.current
        if (api?.getAppState().activeEmbeddable?.state === 'active') return
        if (api?.getAppState().editingTextElement) return
        event.preventDefault()
        window.getSelection()?.removeAllRanges()
        // Do not stopPropagation — Excalidraw's select-all must still run.
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [exitPlaceModes, hideHighlightToolbar])

  // Pending toolbar: hide when the DOM selection collapses / is cleared.
  useEffect(() => {
    const onSelectionChange = () => {
      if (!pendingHighlightRef.current) return
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
        hideHighlightToolbar()
      }
    }
    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [hideHighlightToolbar])

  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const root = containerRef.current
      if (!root) return

      const active = document.activeElement
      const inCanvas =
        (event.target instanceof Node && root.contains(event.target)) ||
        (active instanceof Node && root.contains(active))
      if (!inCanvas) return

      const url = pastedHttpUrlForSearchCapture(event.clipboardData)
      if (!url) return

      const focusEl = active instanceof HTMLElement ? active : null
      if (focusEl) {
        const tag = focusEl.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        if (focusEl.isContentEditable || focusEl.closest('[contenteditable="true"]')) return
      }

      const api = apiRef.current
      if (!api) return

      const appState = api.getAppState() as {
        activeEmbeddable?: { state?: string } | null
        editingTextElement?: unknown
        width: number
        height: number
        scrollX: number
        scrollY: number
        zoom: { value: number }
      }
      if (appState.activeEmbeddable?.state === 'active') return
      if (appState.editingTextElement) return

      event.preventDefault()
      event.stopPropagation()

      const z = appState.zoom.value || 1
      const sceneX = -appState.scrollX + appState.width / (2 * z)
      const sceneY = -appState.scrollY + appState.height / (2 * z)
      const capture = createSearchCapture({
        x: sceneX - SEARCH_CAPTURE_WIDTH / 2,
        y: sceneY - SEARCH_CAPTURE_HEIGHT / 2,
        query: '',
        url
      })
      api.updateScene({
        elements: [...api.getSceneElements(), capture],
        appState: {
          selectedElementIds: { [capture.id]: true }
        },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      setSelectionToolLocked(api, false)
      queueStripPdfNoteLinks()
      markUnsaved()
      void openSearchBrowser(capture)
    }

    window.addEventListener('paste', onPaste, true)
    return () => window.removeEventListener('paste', onPaste, true)
  }, [markUnsaved, openSearchBrowser, queueStripPdfNoteLinks])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseUp = () => {
      textSelectGestureRef.current = false

      const api = apiRef.current
      if (!api) return

      const selection = window.getSelection()
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) return
      const anchor = selection.anchorNode
      const anchorEl = anchor instanceof Element ? anchor : (anchor?.parentElement ?? null)
      if (!anchorEl?.closest('.textLayer')) return

      const skeletons = selectionToHighlightSkeletons(api.getAppState())
      if (!skeletons) return

      // Snapshot only — create on color click via HighlightToolbar.
      showPendingHighlightToolbar(skeletons)
      focusCanvasRoot()
    }

    el.addEventListener('mouseup', onMouseUp)
    return () => el.removeEventListener('mouseup', onMouseUp)
  }, [focusCanvasRoot, showPendingHighlightToolbar])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
      const overText =
        pdfTextPassRef.current ||
        (event.target instanceof Element && event.target.closest('.textLayer'))
      if (!overText) return

      const api = apiRef.current
      if (!api) return

      event.preventDefault()
      const state = api.getAppState()
      const zoom = state.zoom.value

      if (event.metaKey || event.ctrlKey) {
        const sign = Math.sign(event.deltaY)
        const absDelta = Math.abs(event.deltaY)
        let delta = event.deltaY
        const maxStep = 10
        if (absDelta > maxStep) delta = maxStep * sign

        let nextZoom = zoom - delta / 100
        nextZoom += Math.log10(Math.max(1, zoom)) * -sign * Math.min(1, absDelta / 20)
        nextZoom = Math.min(30, Math.max(0.1, nextZoom))

        const rect = el.getBoundingClientRect()
        const viewportX = event.clientX - rect.left
        const viewportY = event.clientY - rect.top
        const invZoom = 1 / zoom
        const invNext = 1 / nextZoom

        api.updateScene({
          appState: {
            zoom: { value: nextZoom as NormalizedZoomValue },
            scrollX: state.scrollX + viewportX * (invNext - invZoom),
            scrollY: state.scrollY + viewportY * (invNext - invZoom)
          }
        })
        return
      }

      if (event.shiftKey) {
        api.updateScene({
          appState: {
            scrollX: state.scrollX - (event.deltaY || event.deltaX) / zoom
          }
        })
        return
      }

      api.updateScene({
        appState: {
          scrollX: state.scrollX - event.deltaX / zoom,
          scrollY: state.scrollY - event.deltaY / zoom
        }
      })
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [])

  // Hit-test gate: selection tool + over PDF text layer box + no nearby scene
  // element → pass through. Use geometric `.textLayer` bounds (not event.target):
  // while Excalidraw is on top, target is the canvas, so closest('.textLayer')
  // would never arm pass. Gutters keep marquee. Pad + pointerdown forward fix
  // the PE-toggle race (browser sticks the event target for that frame).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    /** Screen px → scene pad so hover clears pass before entering the element. */
    const PASS_HIT_PAD_PX = 12
    let forwardingPointer = false

    const isOverTextLayerBox = (clientX: number, clientY: number): boolean => {
      for (const layer of el.querySelectorAll('.textLayer')) {
        const r = layer.getBoundingClientRect()
        if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
          return true
        }
      }
      return false
    }

    const updatePassThrough = (clientX: number, clientY: number, target: EventTarget | null) => {
      if (textSelectGestureRef.current) {
        setPdfTextPass(true)
        return
      }
      if (placeNoteModeRef.current || placeBrowserModeRef.current) {
        setPdfTextPass(false)
        return
      }
      if (isExcalidrawUiPointerTarget(target)) {
        setPdfTextPass(false)
        return
      }
      const api = liveExcalidrawApi(apiRef.current)
      if (!api) {
        setPdfTextPass(false)
        return
      }
      const appState = api.getAppState()
      // @next: re-click selection → lasso; treat both as text-pass tools
      const tool = appState.activeTool.type
      if (!appState.zoom?.value || (tool !== 'selection' && tool !== 'lasso')) {
        setPdfTextPass(false)
        return
      }
      if (appState.activeEmbeddable?.state === 'active') {
        setPdfTextPass(false)
        return
      }
      // Image search captures browse without activeEmbeddable; keep host hittable
      // so outside-click deactivate (listener on .excalidraw-host) still runs.
      if (isBrowsing()) {
        setPdfTextPass(false)
        return
      }
      // Selection / linear-point edit owns the pointer — keep Excalidraw PE so
      // arrow anchors, bend dots, and resize chrome stay hittable over PDF text
      // (hairline AABB + pad miss would otherwise arm pass).
      if (holdsPdfTextPassOff(appState)) {
        setPdfTextPass(false)
        return
      }
      // Empty gutters (not over a page text layer): Excalidraw keeps marquee.
      if (!isOverTextLayerBox(clientX, clientY)) {
        setPdfTextPass(false)
        return
      }
      const { x, y } = clientToSceneCoords(clientX, clientY, appState)
      const pad = PASS_HIT_PAD_PX / appState.zoom.value
      const hit = findSceneElementAt(api.getSceneElements(), x, y, pad)
      setPdfTextPass(hit == null)
    }

    const onPointerMove = (event: PointerEvent) => {
      updatePassThrough(event.clientX, event.clientY, event.target)
    }

    const onPointerDown = (event: PointerEvent) => {
      // Synthetic re-dispatch from the race fix below — don't re-enter.
      if (forwardingPointer) return

      const target = event.target
      const wasPass = pdfTextPassRef.current
      updatePassThrough(event.clientX, event.clientY, target)

      const hideToolbarIfOutside = () => {
        if (
          target instanceof Element &&
          !target.closest('[data-highlight-toolbar]') &&
          (activeHighlightIdRef.current || pendingHighlightRef.current)
        ) {
          const wasPending = pendingHighlightRef.current != null
          hideHighlightToolbar()
          if (wasPending) window.getSelection()?.removeAllRanges()
        }
      }

      // Race: pass was on → browser targeted `.textLayer`, but this point is
      // inside a real (unpadded) scene element. Pad alone must not steal text
      // clicks in the halo — only forward on a true AABB hit.
      if (wasPass && target instanceof Element && target.closest('.textLayer')) {
        const api = apiRef.current
        const appState = api?.getAppState()
        const scene =
          api && appState?.zoom?.value
            ? clientToSceneCoords(event.clientX, event.clientY, appState)
            : null
        const strictHit =
          api && scene ? findSceneElementAt(api.getSceneElements(), scene.x, scene.y, 0) : null
        if (strictHit) {
          setPdfTextPass(false)
          hideToolbarIfOutside()
          event.preventDefault()
          event.stopImmediatePropagation()
          const canvas = el.querySelector('.excalidraw__canvas.interactive')
          if (canvas instanceof HTMLElement) {
            forwardingPointer = true
            try {
              canvas.dispatchEvent(
                new PointerEvent('pointerdown', {
                  bubbles: true,
                  cancelable: true,
                  composed: true,
                  pointerId: event.pointerId,
                  pointerType: event.pointerType,
                  isPrimary: event.isPrimary,
                  clientX: event.clientX,
                  clientY: event.clientY,
                  screenX: event.screenX,
                  screenY: event.screenY,
                  button: event.button,
                  buttons: event.buttons,
                  ctrlKey: event.ctrlKey,
                  metaKey: event.metaKey,
                  shiftKey: event.shiftKey,
                  altKey: event.altKey,
                  view: window
                })
              )
            } finally {
              forwardingPointer = false
            }
          }
          return
        }
      }

      if (pdfTextPassRef.current) {
        textSelectGestureRef.current = true
      }

      // Hide toolbar on outside click even when `.pdf-text-pass` (Excalidraw onPointerDown may not fire).
      hideToolbarIfOutside()
    }

    const onPointerUp = (event: PointerEvent) => {
      textSelectGestureRef.current = false
      updatePassThrough(event.clientX, event.clientY, event.target)
    }

    const onBlur = () => {
      textSelectGestureRef.current = false
      setPdfTextPass(false)
    }

    // OS file drag: pointermove freezes, so pass can stay on over PDF text and
    // Excalidraw's onDrop never fires (host PE-none). Clear pass on dragover so
    // the next hit-test reaches Excalidraw. If drop still lands on .textLayer
    // (same-tick PE), re-dispatch to .excalidraw with the live dataTransfer.
    const dataTransferHasFiles = (dt: DataTransfer | null): boolean =>
      !!dt && Array.from(dt.types ?? []).includes('Files')

    const onDragOver = (event: DragEvent) => {
      if (!dataTransferHasFiles(event.dataTransfer)) return
      setPdfTextPass(false)
    }

    let forwardingDrop = false
    const onDropCapture = (event: DragEvent) => {
      if (forwardingDrop) return
      if (!dataTransferHasFiles(event.dataTransfer)) return
      setPdfTextPass(false)
      const target = event.target
      if (!(target instanceof Element) || !target.closest('.textLayer')) return
      const excal = el.querySelector('.excalidraw')
      if (!(excal instanceof HTMLElement)) return
      event.preventDefault()
      event.stopPropagation()
      forwardingDrop = true
      try {
        excal.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX: event.clientX,
            clientY: event.clientY,
            screenX: event.screenX,
            screenY: event.screenY,
            dataTransfer: event.dataTransfer
          })
        )
      } finally {
        forwardingDrop = false
      }
    }

    el.addEventListener('pointermove', onPointerMove, true)
    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('dragover', onDragOver, true)
    el.addEventListener('drop', onDropCapture, true)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointermove', onPointerMove, true)
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('dragover', onDragOver, true)
      el.removeEventListener('drop', onDropCapture, true)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('blur', onBlur)
    }
  }, [hideHighlightToolbar, isBrowsing, setPdfTextPass])

  // Excalidraw setStates activeEmbeddable "hover" on every pointermove over an
  // embed center (no equality guard) → full App re-render. Stop those moves
  // from reaching the canvas; pointerdown/up still activate click-to-edit.
  // Skip while buttons down so edge-drag across the center keeps working.
  useEffect(() => {
    const host = excalidrawHostRef.current
    if (!host) return

    const onPointerMoveCapture = (event: PointerEvent) => {
      if (event.buttons !== 0) return
      if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return
      // Style panel / toolbars sit over the scene — don't steal their hover.
      if (isExcalidrawUiPointerTarget(event.target)) return
      const api = apiRef.current
      if (!api) return
      const appState = api.getAppState()
      if (appState.activeEmbeddable?.state === 'active') return
      const { x, y } = clientToSceneCoords(event.clientX, event.clientY, appState)
      const note = findPdfNoteAt(api.getSceneElements(), x, y)
      if (note && !note.locked && isPdfNoteCenterHit(note, x, y)) {
        event.stopPropagation()
        return
      }
      const capture = findPdfSearchCaptureAt(api.getSceneElements(), x, y)
      if (capture && !capture.locked && isPdfSearchCaptureCenterHit(capture, x, y)) {
        event.stopPropagation()
      }
    }

    host.addEventListener('pointermove', onPointerMoveCapture, true)
    return () => host.removeEventListener('pointermove', onPointerMoveCapture, true)
  }, [])

  return (
    <div
      ref={containerRef}
      data-pdf-canvas-root
      tabIndex={-1}
      className="relative h-full w-full overflow-hidden bg-morphing-50"
    >
      {session ? (
        <PdfLayer
          ref={pdfLayerRef}
          layout={session.layout}
          pool={session.pool}
          textPool={session.textPool}
        />
      ) : null}

      <div ref={excalidrawHostRef} className="excalidraw-host absolute inset-0 z-10">
        <Excalidraw
          onExcalidrawAPI={(api) => {
            apiRef.current = api
          }}
          // PDF text pass-through / toolbar clicks leave focus outside `.excalidraw`;
          // without this, Cmd/Ctrl+Z (undo) only works after clicking the canvas.
          handleKeyboardGlobally
          initialData={initialData}
          onChange={handleExcalidrawChange}
          onScrollChange={handleScrollChange}
          onPointerDown={handlePointerDown}
          onDuplicate={(nextElements) =>
            fixDuplicatedPdfSearchCaptures(fixDuplicatedPdfNotes(nextElements))
          }
          onLinkOpen={(_element, event) => {
            event.preventDefault()
          }}
          theme="light"
          validateEmbeddable={(link) =>
            typeof link === 'string' &&
            (link.startsWith(NOTE_EMBED_LINK) || link.startsWith(SEARCH_CAPTURE_EMBED_LINK))
              ? true
              : false
          }
          renderEmbeddable={renderEmbeddable}
          UIOptions={{
            canvasActions: {
              clearCanvas: false,
              saveToActiveFile: false,
              loadScene: false,
              export: false,
              saveAsImage: false,
              toggleTheme: false,
              changeViewBackgroundColor: false
            }
          }}
        ></Excalidraw>
      </div>
      {session && pageCount > 0 ? (
        <div className="pointer-events-none absolute left-0 top-12 z-10 grid grid-cols-[1fr_2fr_1fr] gap-8 2xl:grid-cols-3 w-full h-10 items-center 2xl:gap-12">
          <div
            role="toolbar"
            aria-label="PDF tools"
            className="pointer-events-auto flex h-full w-fit rounded-xl bg-neutral-100 p-1 shadow-md shadow-morphing-900/10 border border-black/10 py-1 col-[2/3] mx-auto"
          >
            <PageNavigator
              ref={pageNavigatorRef}
              pageCount={pageCount}
              initialPage={currentPageRef.current}
              onGoToPage={goToPage1Based}
              onPrev={goPrevPage}
              onNext={goNextPage}
            />
            <div className="mx-2 h-full w-px shrink-0 bg-neutral-200" aria-hidden />
            <button
              type="button"
              aria-label="Search"
              aria-pressed={findOpen}
              className={`flex h-full w-10 items-center justify-center rounded-lg transition-transform duration-150 ease-out active:scale-[0.96] ${
                findOpen
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-200'
              }`}
              onClick={toggleFind}
            >
              <Search className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Place note"
              aria-pressed={placeNoteMode}
              className={`flex h-full w-10 items-center justify-center rounded-lg transition-transform duration-150 ease-out active:scale-[0.96] ${
                placeNoteMode
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-200'
              }`}
              onClick={togglePlaceNoteMode}
            >
              <StickyNote className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="Place browser"
              aria-pressed={placeBrowserMode}
              className={`flex h-full w-10 items-center justify-center rounded-lg transition-transform duration-150 ease-out active:scale-[0.96] ${
                placeBrowserMode
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-200'
              }`}
              onClick={togglePlaceBrowserMode}
            >
              <Globe className="size-4" aria-hidden />
            </button>
            {findOpen ? (
              <>
                <div className="mx-2 h-full w-px shrink-0 bg-neutral-200" aria-hidden />
                <PdfFindBar
                  ref={findBarRef}
                  onQueryChange={handleFindQueryChange}
                  onNext={goNextMatch}
                  onPrev={goPrevMatch}
                  onClose={closeFind}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <HighlightToolbar
        ref={highlightToolbarRef}
        pending={highlightToolbarPending}
        activeColor={activeHighlightColor}
        onRecolor={recolorActiveHighlight}
        onAddNote={addNoteToActiveHighlight}
        onSearch={addSearchCaptureToActiveHighlight}
        onCopy={copyActiveHighlightText}
        onRemove={removeActiveHighlight}
      />

      <BrowserChrome
        ref={browserChromeRef}
        zoomPercentRef={zoomPercentRef}
        onZoomIn={() => void zoomIn()}
        onZoomOut={() => void zoomOut()}
        onResizePortrait={() =>
          resizeActiveBrowser(SEARCH_CAPTURE_PORTRAIT.width, SEARCH_CAPTURE_PORTRAIT.height)
        }
        onResizeLandscape={() =>
          resizeActiveBrowser(SEARCH_CAPTURE_LANDSCAPE.width, SEARCH_CAPTURE_LANDSCAPE.height)
        }
      />

      {session && pageCount > 0 && showPdfOutline ? (
        <PdfSidebar
          ref={pdfSidebarRef}
          outline={outline}
          pageCount={pageCount}
          thumbPool={session.thumbPool}
          annotations={annotations}
          initialPage={currentPageRef.current}
          onGoToPage={goToPage}
          onGoToAnnotation={goToAnnotation}
        />
      ) : null}

      {saveStatus !== 'saved' ? (
        <div className="pointer-events-none absolute left-3 top-3 z-100">
          <span
            ref={saveChipRef}
            className={`min-w-18 rounded-md px-2.5 py-1.5 text-center text-xs shadow-md shadow-morphing-900/10 ring-1 ring-black/10 ${
              saveStatus === 'error'
                ? 'bg-red-50 text-red-700'
                : saveStatus === 'unsaved'
                  ? 'bg-amber-50 text-amber-800'
                  : 'bg-white text-morphing-600'
            }`}
          >
            {SAVE_STATUS_LABEL[saveStatus]}
          </span>
        </div>
      ) : null}

      {loadError ? (
        <div className="pointer-events-none absolute inset-0 z-110 flex items-center justify-center bg-morphing-50/80">
          <p className="rounded-md bg-white px-4 py-2 text-sm text-red-700 shadow">{loadError}</p>
        </div>
      ) : null}

      {!session && !loadError ? (
        <div className="pointer-events-none absolute inset-0 z-5 flex items-center justify-center">
          <p className="text-sm text-neutral-500">Loading PDF…</p>
        </div>
      ) : null}
    </div>
  )
}
