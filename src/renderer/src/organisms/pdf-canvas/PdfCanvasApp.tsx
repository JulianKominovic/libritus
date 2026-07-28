import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  newElementWith,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue
} from '@excalidraw/excalidraw/types'
import { enqueueRagIndex } from '@renderer/lib/ai/ipc'
import { readFile } from '@renderer/integrations/fs'
import { setActivePageJump } from '@renderer/lib/pdf-canvas/active-page-jump'
import { setActiveSessionFlush } from '@renderer/lib/pdf-canvas/active-session-flush'
import { clearSessionPersistFreeze, isSessionPersistFrozen } from '@renderer/lib/pdf-canvas/sessionPersistFreeze'
import {
  annotationsSignature,
  canvasStatsNeedWriteback,
  countCanvasStats,
  listAnnotations,
  type AnnotationListItem
} from '@renderer/lib/pdf-canvas/annotationList'
import {
  fileIdsFromElements,
  loadBinaryFiles,
  persistNewBinaryFiles
} from '@renderer/lib/pdf-canvas/attachments'
import { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { PagePool } from '@renderer/lib/pdf-canvas/PagePool'
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
  SEARCH_CAPTURE_EMBED_LINK,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_LANDSCAPE,
  SEARCH_CAPTURE_PORTRAIT,
  SEARCH_CAPTURE_WIDTH,
  syncPdfSearchArrows
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { buildTextChunks, extractPageTexts } from '@renderer/lib/pdf-canvas/pdfRag'
import { loadOutline, type OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
import { PdfTextSearch, type SearchMatch } from '@renderer/lib/pdf-canvas/pdfSearch'
import {
  clientToSceneCoords,
  findPdfHighlightAt,
  HIGHLIGHT_FILL,
  highlightGroupId,
  selectionToHighlightSkeletons,
  setHighlightGroupColor
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import {
  pageWorldScale,
  renderScaleForWorld,
  scaleSessionScene
} from '@renderer/lib/pdf-canvas/pageWorldScale'
import {
  readSession,
  writeSession,
  SESSION_VERSION,
  type SaveStatus,
  type SessionSnapshot
} from '@renderer/lib/pdf-canvas/session'
import { shouldApplyOpenResult } from '@renderer/lib/pdf-canvas/sessionOpen'
import { persistSignature, shouldMarkDirty } from '@renderer/lib/pdf-canvas/sessionPersist'
import { isExcalidrawUiPointerTarget } from '@renderer/lib/pdf-canvas/excalidrawUiTarget'
import { TextLayerPool } from '@renderer/lib/pdf-canvas/TextLayerPool'
import { ThumbPool } from '@renderer/lib/pdf-canvas/ThumbPool'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { usePdfs } from '@renderer/stores/categories'
import { useSettings } from '@renderer/stores/settings'
import { Globe, HighlighterIcon, Search, StickyNote } from 'lucide-react'
import type { Value } from 'platejs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { BrowserChrome } from './BrowserChrome'
import { HighlightToolbar } from './HighlightToolbar'
import { NoteEmbed } from './NoteEmbed'
import { PageNavigator, type PageNavigatorHandle } from './PageNavigator'
import { PdfFindBar, type PdfFindBarHandle } from './PdfFindBar'
import { PdfLayer, type PdfLayerHandle } from './PdfLayer'
import { PdfSidebar, type PdfSidebarHandle } from './PdfSidebar'
import { SearchCaptureEmbed } from './SearchCaptureEmbed'
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

function syncReadingProgress(categoryId: string, pdfId: string, pages: number, totalPages: number) {
  const percentage = totalPages > 0 ? (pages / totalPages) * 100 : 0
  const store = usePdfs.getState()
  const pdf = store.categories.find((c) => c.id === categoryId)?.pdfs.find((p) => p.id === pdfId)
  if (
    pdf &&
    pdf.progress.pages === pages &&
    pdf.progress.percentage === percentage &&
    pdf.progress.offset === 0
  ) {
    return
  }
  void store.updatePdf(categoryId, pdfId, {
    progress: { pages, percentage, offset: 0 }
  })
}

function syncCanvasStats(
  categoryId: string,
  pdfId: string,
  elements: Parameters<typeof countCanvasStats>[0]
) {
  const stats = countCanvasStats(elements)
  const store = usePdfs.getState()
  const pdf = store.categories.find((c) => c.id === categoryId)?.pdfs.find((p) => p.id === pdfId)
  if (!canvasStatsNeedWriteback(pdf?.canvasStats, stats)) return
  void store.updatePdf(categoryId, pdfId, { canvasStats: stats })
}

/**
 * React state kept only when a re-render is required:
 * - session: mount PdfLayer / navigator / enable tools
 * - textSelectMode: CSS pass-through + PdfLayer prop + listeners
 * - saveStatus: persistence chip
 * - place-note mode chip
 * - find bar open
 * - sidebar annotations list (id/kind/preview signature only)
 *
 * Everything else (camera, page, highlight chip) is ref + DOM.
 * Notes: Excalidraw embeddable + renderEmbeddable (no parallel HUD).
 */
export function PdfCanvasApp({ categoryId, pdfId }: PdfCanvasAppProps) {
  const [, setLocation] = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const excalidrawHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<RuntimeSession | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA)
  const pdfLayerRef = useRef<PdfLayerHandle>(null)
  const pageNavigatorRef = useRef<PageNavigatorHandle>(null)
  const pdfSidebarRef = useRef<PdfSidebarHandle>(null)
  const findBarRef = useRef<PdfFindBarHandle>(null)
  const searcherRef = useRef<PdfTextSearch | null>(null)
  const matchesRef = useRef<SearchMatch[]>([])
  const matchIndexRef = useRef(-1)
  const searchAbortRef = useRef<AbortController | null>(null)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const highlightToolbarRef = useRef<HTMLDivElement>(null)
  const activeHighlightIdRef = useRef<string | null>(null)
  const placeNoteModeRef = useRef(false)
  const placeBrowserModeRef = useRef(false)
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
  const [textSelectMode, setTextSelectMode] = useState(false)
  const [placeNoteMode, setPlaceNoteMode] = useState(false)
  const [placeBrowserMode, setPlaceBrowserMode] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([])
  const annotationsSigRef = useRef('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>(HIGHLIGHT_FILL)

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
    const toolbar = highlightToolbarRef.current
    if (toolbar) toolbar.style.display = 'none'
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
    const highlightId = activeHighlightIdRef.current
    if (!toolbar || !api || !container || !highlightId) return

    const highlight = api.getSceneElements().find((el) => el.id === highlightId)
    if (!highlight || highlight.isDeleted) {
      hideHighlightToolbar()
      return
    }

    const appState = api.getAppState()
    const topCenter = sceneCoordsToViewportCoords(
      {
        sceneX: highlight.x + highlight.width / 2,
        sceneY: highlight.y
      },
      appState
    )
    const bounds = container.getBoundingClientRect()
    toolbar.style.left = `${topCenter.x - bounds.left}px`
    toolbar.style.top = `${topCenter.y - bounds.top - 8}px`
    toolbar.style.display = 'flex'
  }, [hideHighlightToolbar])

  const showHighlightToolbar = useCallback(
    (highlightId: string) => {
      activeHighlightIdRef.current = highlightId
      const el = apiRef.current?.getSceneElements().find((e) => e.id === highlightId)
      if (el) setActiveHighlightColor(el.backgroundColor || HIGHLIGHT_FILL)
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

      if (activeHighlightIdRef.current) {
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
    const api = apiRef.current
    if (!api) return null
    const pending = pendingPlateByNoteIdRef.current
    return api
      .getSceneElements()
      .filter((el) => !el.isDeleted)
      .map((el) => {
        let normalized = normalizePdfNote(el)
        normalized = normalizePdfSearchCapture(normalized)
        const plate = pending.get(el.id)
        // ponytail: merge unsynced Plate edits so autosave/flush see live text
        return plate !== undefined ? withNotePlateValue(normalized, plate) : normalized
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
    const api = apiRef.current
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
    const activeEl = activeId ? next.find((el) => el.id === activeId) : null
    api.updateScene({
      elements: next,
      ...(activeEl
        ? { appState: { activeEmbeddable: { element: activeEl, state: 'active' } } }
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

        // Start RAG as soon as the doc exists. Leave-PDF does not cancel main queue;
        // extract may still fail if the doc is destroyed mid-read.
        void (async () => {
          try {
            const nodes = await loadOutline(doc)
            if (shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
              setOutline(nodes)
            }
            const pageTexts = await extractPageTexts(doc)
            const { chunks, fingerprint } = buildTextChunks(pageTexts, nodes)
            const title = usePdfs
              .getState()
              .categories.find((c) => c.id === categoryId)
              ?.pdfs.find((p) => p.id === pdfId)?.name
            await enqueueRagIndex({ pdfId, fingerprint, chunks, title })
          } catch (err) {
            console.error('RAG enqueue failed', err)
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
                  (migrated.elements as ReturnType<ExcalidrawImperativeAPI['getSceneElements']>).map(
                    (el) => normalizePdfSearchCapture(normalizePdfNote(el))
                  )
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
      if (dirtyRef.current && apiRef.current && !isSessionPersistFrozen()) {
        const api = apiRef.current
        const cam = cameraRef.current
        const elements = JSON.parse(
          JSON.stringify(
            api
              .getSceneElements()
              .filter((el) => !el.isDeleted)
              .map((el) => normalizePdfSearchCapture(normalizePdfNote(el)))
          )
        ) as unknown[]
        const snapshot: SessionSnapshot = {
          version: SESSION_VERSION,
          docId: pdfId,
          updatedAt: new Date().toISOString(),
          camera: {
            scrollX: cam.scrollX,
            scrollY: cam.scrollY,
            zoom: cam.zoom
          },
          elements
        }
        void writeSession(pdfId, snapshot)
        const totalPages = sessionRef.current?.doc.pageCount ?? 0
        syncReadingProgress(categoryId, pdfId, currentPageRef.current, totalPages)
        syncCanvasStats(categoryId, pdfId, elements as Parameters<typeof countCanvasStats>[0])
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
  }, [categoryId, clearSaveTimer, disposeBrowser, pdfId])

  useEffect(() => {
    if (!session) {
      searchAbortRef.current?.abort()
      searchAbortRef.current = null
      searcherRef.current = null
      matchesRef.current = []
      matchIndexRef.current = -1
      pdfLayerRef.current?.setSearchHit(null)
      setFindOpen(false)
      return
    }
    searcherRef.current = new PdfTextSearch(session.doc)
    return () => {
      searchAbortRef.current?.abort()
      searchAbortRef.current = null
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searcherRef.current?.clear()
      searcherRef.current = null
      matchesRef.current = []
      matchIndexRef.current = -1
      pdfLayerRef.current?.setSearchHit(null)
    }
  }, [session])

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
      if (!href || href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) {
        return
      }

      const url = new URL(href, window.location.origin)
      if (url.origin !== window.location.origin) return
      if (url.pathname === window.location.pathname) return

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
        const api = apiRef.current
        if (api) {
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
      isBrowsing,
      markUnsaved,
      queueStripPdfNoteLinks,
      syncActiveBrowserBounds,
      syncAnnotations
    ]
  )

  const toggleTextSelectMode = useCallback(() => {
    setTextSelectMode((prev) => {
      const next = !prev
      if (next) {
        hideHighlightToolbar()
        setPlaceNoteMode(false)
        placeNoteModeRef.current = false
        setPlaceBrowserMode(false)
        placeBrowserModeRef.current = false
        clearActiveEmbeddable()
      } else {
        window.getSelection()?.removeAllRanges()
      }
      return next
    })
  }, [clearActiveEmbeddable, hideHighlightToolbar])

  const togglePlaceNoteMode = useCallback(() => {
    setPlaceNoteMode((prev) => {
      const next = !prev
      placeNoteModeRef.current = next
      if (next) {
        setTextSelectMode(false)
        setPlaceBrowserMode(false)
        placeBrowserModeRef.current = false
        hideHighlightToolbar()
        clearActiveEmbeddable()
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: true,
              lastActiveTool: null,
              customType: null
            }
          }
        })
      } else {
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
      }
      return next
    })
  }, [clearActiveEmbeddable, hideHighlightToolbar])

  const togglePlaceBrowserMode = useCallback(() => {
    setPlaceBrowserMode((prev) => {
      const next = !prev
      placeBrowserModeRef.current = next
      if (next) {
        setTextSelectMode(false)
        setPlaceNoteMode(false)
        placeNoteModeRef.current = false
        hideHighlightToolbar()
        clearActiveEmbeddable()
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: true,
              lastActiveTool: null,
              customType: null
            }
          }
        })
      } else {
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
      }
      return next
    })
  }, [clearActiveEmbeddable, hideHighlightToolbar])

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

  const goToMatch = useCallback(
    (index: number) => {
      const matches = matchesRef.current
      if (matches.length === 0) return

      const i = ((index % matches.length) + matches.length) % matches.length
      matchIndexRef.current = i
      const hit = matches[i]!
      findBarRef.current?.setMatchInfo(i + 1, matches.length)
      pdfLayerRef.current?.setSearchHit(hit)

      const layout = sessionRef.current?.layout
      const api = apiRef.current
      if (!layout || !api) return

      const page = layout.pages[hit.pageIndex]
      if (!page) return
      const rect = hit.rects[0]
      const worldY = rect ? page.y + rect.y + rect.height / 2 : page.y + page.height / 2
      const target = layout.scrollForWorldY(worldY, cameraRef.current)
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

  const runSearch = useCallback(
    (query: string) => {
      searchAbortRef.current?.abort()
      matchesRef.current = []
      matchIndexRef.current = -1
      pdfLayerRef.current?.setSearchHit(null)
      findBarRef.current?.setMatchInfo(0, 0)

      const searcher = searcherRef.current
      if (!searcher || !query.trim()) return

      const ac = new AbortController()
      searchAbortRef.current = ac
      let jumped = false

      void searcher
        .search(query, {
          signal: ac.signal,
          onProgress: ({ matches }) => {
            matchesRef.current = matches
            if (matches.length === 0) {
              findBarRef.current?.setMatchInfo(0, 0)
              return
            }
            if (!jumped) {
              jumped = true
              goToMatch(0)
            } else {
              findBarRef.current?.setMatchInfo(matchIndexRef.current + 1, matches.length)
            }
          }
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === 'AbortError') return
          console.error(err)
        })
    },
    [goToMatch]
  )

  const handleFindQueryChange = useCallback(
    (query: string) => {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
      searchDebounceRef.current = setTimeout(() => runSearch(query), 250)
    },
    [runSearch]
  )

  const closeFind = useCallback(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
    searchAbortRef.current?.abort()
    searchAbortRef.current = null
    matchesRef.current = []
    matchIndexRef.current = -1
    pdfLayerRef.current?.setSearchHit(null)
    setFindOpen(false)
  }, [])

  const toggleFind = useCallback(() => {
    setFindOpen((prev) => {
      if (prev) {
        if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current)
        searchAbortRef.current?.abort()
        searchAbortRef.current = null
        matchesRef.current = []
        matchIndexRef.current = -1
        pdfLayerRef.current?.setSearchHit(null)
        return false
      }
      return true
    })
  }, [])

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
        placeNoteModeRef.current = false
        setPlaceNoteMode(false)
        // Select only — edit via Excalidraw embed activate (click center).
        hideHighlightToolbar()
        api.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
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
        placeBrowserModeRef.current = false
        setPlaceBrowserMode(false)
        hideHighlightToolbar()
        api.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
        queueStripPdfNoteLinks()
        markUnsaved()
        return
      }

      const hit = findPdfHighlightAt(api.getSceneElements(), sceneX, sceneY)
      if (hit) {
        showHighlightToolbar(hit.id)
      } else {
        hideHighlightToolbar()
      }
    },
    [hideHighlightToolbar, markUnsaved, queueStripPdfNoteLinks, showHighlightToolbar]
  )

  const addNoteToActiveHighlight = useCallback(() => {
    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const highlight = api.getSceneElements().find((el) => el.id === highlightId)
    if (!highlight) return

    const scene = api.getSceneElements()
    const { newElements } = createNoteFromHighlight(highlight, scene)

    api.updateScene({
      elements: [...scene, ...newElements],
      appState: {
        selectedElementIds: Object.fromEntries(
          newElements.filter((el) => isPdfNote(el)).map((el) => [el.id, true])
        )
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    // Select only — edit via embed activate (same as free place).
    hideHighlightToolbar()
    queueStripPdfNoteLinks()
    markUnsaved()
  }, [hideHighlightToolbar, markUnsaved, queueStripPdfNoteLinks])

  const addSearchCaptureToActiveHighlight = useCallback(() => {
    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const highlight = api.getSceneElements().find((el) => el.id === highlightId)
    if (!highlight) return

    const scene = api.getSceneElements()
    const { newElements } = createSearchCaptureFromHighlight(highlight, scene)

    api.updateScene({
      elements: [...scene, ...newElements],
      appState: {
        selectedElementIds: Object.fromEntries(
          newElements.filter((el) => isPdfSearchCapture(el)).map((el) => [el.id, true])
        )
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    hideHighlightToolbar()
    // Keep capture link for embedsValidationStatus; notes still get stripped.
    queueStripPdfNoteLinks()
    markUnsaved()
  }, [hideHighlightToolbar, markUnsaved, queueStripPdfNoteLinks])

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
        toDelete.has(el.id) ? (newElementWith(el, { isDeleted: true }) as typeof el) : el
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    hideHighlightToolbar()
    markUnsaved()
  }, [hideHighlightToolbar, markUnsaved])

  const recolorActiveHighlight = useCallback(
    (color: string) => {
      const api = apiRef.current
      const highlightId = activeHighlightIdRef.current
      if (!api || !highlightId) return

      const scene = api.getSceneElements()
      const highlight = scene.find((el) => el.id === highlightId)
      if (!highlight || highlight.isDeleted) return

      api.updateScene({
        elements: setHighlightGroupColor(scene, highlightGroupId(highlight), color),
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })
      setActiveHighlightColor(color)
      markUnsaved()
    },
    [markUnsaved]
  )

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (placeNoteModeRef.current) {
        placeNoteModeRef.current = false
        setPlaceNoteMode(false)
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
        event.preventDefault()
        return
      }
      if (placeBrowserModeRef.current) {
        placeBrowserModeRef.current = false
        setPlaceBrowserMode(false)
        apiRef.current?.updateScene({
          appState: {
            activeTool: {
              type: 'selection',
              locked: false,
              lastActiveTool: null,
              customType: null
            }
          }
        })
        event.preventDefault()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!textSelectMode) return
    const el = containerRef.current
    if (!el) return

    const onMouseUp = () => {
      const api = apiRef.current
      if (!api) return

      const skeletons = selectionToHighlightSkeletons(api.getAppState())
      if (!skeletons) return

      const newElements = convertToExcalidrawElements(skeletons)
      api.updateScene({
        elements: [...api.getSceneElements(), ...newElements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })

      window.getSelection()?.removeAllRanges()
      setTextSelectMode(false)
      markUnsaved()
    }

    el.addEventListener('mouseup', onMouseUp)
    return () => el.removeEventListener('mouseup', onMouseUp)
  }, [markUnsaved, textSelectMode])

  useEffect(() => {
    if (!textSelectMode) return
    const el = containerRef.current
    if (!el) return

    const onWheel = (event: WheelEvent) => {
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
            scrollX: state.scrollX + viewportX * (invZoom - invNext),
            scrollY: state.scrollY + viewportY * (invZoom - invNext)
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
  }, [textSelectMode])

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
      className={`relative h-full w-full overflow-hidden bg-morphing-50${
        textSelectMode ? ' text-select-mode' : ''
      }`}
    >
      {session ? (
        <PdfLayer
          ref={pdfLayerRef}
          layout={session.layout}
          pool={session.pool}
          textPool={session.textPool}
          textSelectMode={textSelectMode}
        />
      ) : null}

      <div
        ref={excalidrawHostRef}
        className={`absolute inset-0 z-10${textSelectMode ? ' pointer-events-none' : ''}`}
      >
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
          }}
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
        <div className="pointer-events-auto absolute left-0 top-12 z-10 grid grid-cols-[1fr_2fr_1fr] gap-8 2xl:grid-cols-3 w-full h-10 items-center 2xl:gap-12">
          <div
            role="toolbar"
            aria-label="PDF tools"
            className="flex h-full w-fit rounded-xl bg-neutral-100 p-1 shadow-md shadow-morphing-900/10 border border-black/10 py-1 col-[2/3] mx-auto"
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
            <button
              type="button"
              aria-label="Select text"
              aria-pressed={textSelectMode}
              className={`flex h-full w-10 items-center justify-center rounded-lg transition-transform duration-150 ease-out active:scale-[0.96] ${
                textSelectMode
                  ? 'bg-neutral-200 text-neutral-900'
                  : 'text-neutral-700 [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-200'
              }`}
              onClick={toggleTextSelectMode}
            >
              <HighlighterIcon className="size-4" aria-hidden />
            </button>
            {findOpen ? (
              <>
                <div className="mx-2 h-full w-px shrink-0 bg-neutral-200" aria-hidden />
                <PdfFindBar
                  ref={findBarRef}
                  onQueryChange={handleFindQueryChange}
                  onNext={() => goToMatch(matchIndexRef.current + 1)}
                  onPrev={() => goToMatch(matchIndexRef.current - 1)}
                  onClose={closeFind}
                />
              </>
            ) : null}
          </div>
        </div>
      ) : null}
      <HighlightToolbar
        ref={highlightToolbarRef}
        activeColor={activeHighlightColor}
        onRecolor={recolorActiveHighlight}
        onAddNote={addNoteToActiveHighlight}
        onSearch={addSearchCaptureToActiveHighlight}
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
