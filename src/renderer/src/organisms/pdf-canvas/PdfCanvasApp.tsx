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
import { readFile } from '@renderer/integrations/fs'
import { setActivePageJump } from '@renderer/lib/pdf-canvas/active-page-jump'
import { setActiveSessionFlush } from '@renderer/lib/pdf-canvas/active-session-flush'
import {
  annotationsSignature,
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
import { loadOutline, type OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
import { ThumbPool } from '@renderer/lib/pdf-canvas/ThumbPool'
import {
  clearPdfNoteLinkForUi,
  createNoteFromHighlight,
  createWysiwygNote,
  fixDuplicatedPdfNotes,
  getNotePlateValue,
  isPdfNote,
  normalizePdfNote,
  NOTE_EMBED_LINK,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  repairUnvalidatedPdfNotes,
  withNotePlateValue
} from '@renderer/lib/pdf-canvas/pdfNotes'
import {
  findPdfHighlightAt,
  selectionToHighlightSkeletons
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import {
  readSession,
  type SaveStatus,
  type SessionSnapshot,
  writeSession
} from '@renderer/lib/pdf-canvas/session'
import { shouldApplyOpenResult } from '@renderer/lib/pdf-canvas/sessionOpen'
import { persistSignature, shouldMarkDirty } from '@renderer/lib/pdf-canvas/sessionPersist'
import { TextLayerPool } from '@renderer/lib/pdf-canvas/TextLayerPool'
import { PdfTextSearch, type SearchMatch } from '@renderer/lib/pdf-canvas/pdfSearch'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { usePdfs } from '@renderer/stores/categories'
import type { Value } from 'platejs'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { NoteEmbed } from './NoteEmbed'
import { PageNavigator, type PageNavigatorHandle } from './PageNavigator'
import { PdfFindBar, type PdfFindBarHandle } from './PdfFindBar'
import { PdfLayer, type PdfLayerHandle } from './PdfLayer'
import { PdfSidebar, type PdfSidebarHandle } from './PdfSidebar'

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

  const [session, setSession] = useState<RuntimeSession | null>(null)
  const [textSelectMode, setTextSelectMode] = useState(false)
  const [placeNoteMode, setPlaceNoteMode] = useState(false)
  const [findOpen, setFindOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([])
  const annotationsSigRef = useRef('')
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')
  const [loadError, setLoadError] = useState<string | null>(null)

  const initialData = useMemo(
    () => ({
      appState: {
        viewBackgroundColor: 'transparent',
        currentItemArrowType: 'elbow' as const,
        scrollX: INITIAL_CAMERA.scrollX,
        scrollY: INITIAL_CAMERA.scrollY,
        zoom: { value: INITIAL_CAMERA.zoom as NormalizedZoomValue }
      },
      elements: []
    }),
    []
  )

  const syncSaveChip = useCallback((next: SaveStatus) => {
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
    },
    [positionHighlightToolbar]
  )

  /** List identity/preview only — skip setState when signature unchanged. */
  const syncAnnotations = useCallback((elements: Parameters<typeof listAnnotations>[0]) => {
    const items = listAnnotations(elements)
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

  /** Persist notes with link restored (UI may have stripped it after embed validate). */
  const sceneElementsForPersist = useCallback(() => {
    const api = apiRef.current
    if (!api) return null
    return api
      .getSceneElements()
      .filter((el) => !el.isDeleted)
      .map(normalizePdfNote)
  }, [])

  /**
   * After Excalidraw validates embeddables (needs link once), clear note links so
   * the canvas link icon / open-in-new-tab hit-test disappear. Capture NEVER —
   * normalizePdfNote on persist restores the link for the next open.
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
      version: 1,
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
    prev.pool.destroy()
    prev.textPool.destroy()
    prev.thumbPool.destroy()
    await prev.doc.destroy()
    sessionRef.current = null
    setSession(null)
    setOutline([])
    setSidebarOpen(false)
  }, [])

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
    readyRef.current = false
    dirtyRef.current = false
    lastSavedSigRef.current = ''
    pendingSigRef.current = ''
    persistedAttachmentIdsRef.current = new Set()
    noteIdsRef.current = new Set()
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

        const layout = new PageLayout(doc.pageSizes)
        const pool = new PagePool(doc)
        const textPool = new TextLayerPool(doc)
        const thumbPool = new ThumbPool(doc)
        const next: RuntimeSession = { doc, layout, pool, textPool, thumbPool }
        sessionRef.current = next
        setSession(next)

        void loadOutline(doc).then((nodes) => {
          if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) return
          setOutline(nodes)
        })

        const cam = snapshot?.camera
        const scrollX = cam?.scrollX ?? INITIAL_CAMERA.scrollX
        const scrollY = cam?.scrollY ?? INITIAL_CAMERA.scrollY
        const zoom = (cam?.zoom ?? INITIAL_CAMERA.zoom) as NormalizedZoomValue
        const elements =
          snapshot?.elements && Array.isArray(snapshot.elements)
            ? (snapshot.elements as ReturnType<ExcalidrawImperativeAPI['getSceneElements']>).map(
                normalizePdfNote
              )
            : []

        const attachmentIds = fileIdsFromElements(elements)
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

        // Seed before strip so paste-repair won't rematerialize restored notes.
        noteIdsRef.current = new Set(
          elements.filter((el) => isPdfNote(el) && !el.isDeleted).map((el) => el.id)
        )

        // Validate embeds (needs link) then clear so canvas link icon disappears.
        stripPdfNoteLinksAfterValidate()

        syncAnnotations(elements)

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
      if (dirtyRef.current && apiRef.current) {
        const api = apiRef.current
        const cam = cameraRef.current
        const elements = JSON.parse(
          JSON.stringify(
            api
              .getSceneElements()
              .filter((el) => !el.isDeleted)
              .map(normalizePdfNote)
          )
        ) as unknown[]
        const snapshot: SessionSnapshot = {
          version: 1,
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
      }
      const current = sessionRef.current
      if (!current) return
      current.pool.destroy()
      current.textPool.destroy()
      current.thumbPool.destroy()
      void current.doc.destroy()
      sessionRef.current = null
    }
  }, [categoryId, clearSaveTimer, pdfId])

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
    (_elements: unknown, _appState: unknown, files: BinaryFiles) => {
      if (files && Object.keys(files).length > 0) {
        void persistNewBinaryFiles(files, persistedAttachmentIdsRef.current)
      }
      if (!restoringRef.current) {
        const api = apiRef.current
        if (api) {
          const repaired = repairUnvalidatedPdfNotes(api.getSceneElements(), noteIdsRef.current)
          noteIdsRef.current = repaired.knownIds
          if (repaired.changed) {
            api.updateScene({
              elements: repaired.elements,
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }
          // onDuplicate restores link without rematerializing (changed=false).
          // Still strip after validate so the canvas link icon stays hidden.
          const scene = repaired.changed ? repaired.elements : api.getSceneElements()
          if (scene.some((el) => isPdfNote(el) && !el.isDeleted && el.link)) {
            queueStripPdfNoteLinks()
          }
          syncAnnotations(scene)
        }
      }
      markUnsaved()
    },
    [markUnsaved, queueStripPdfNoteLinks, syncAnnotations]
  )

  const toggleTextSelectMode = useCallback(() => {
    setTextSelectMode((prev) => {
      const next = !prev
      if (next) {
        hideHighlightToolbar()
        setPlaceNoteMode(false)
        placeNoteModeRef.current = false
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
      const api = apiRef.current
      if (!api) return
      const elements = api.getSceneElements()
      const note = elements.find((el) => el.id === noteId)
      if (!note) return
      // Plate may fire onChange on mount with the same Value ref — skip to avoid
      // updateScene → Excalidraw onChange → parent setState loops.
      if (note.customData?.plateValue === value) return
      const updated = withNotePlateValue(note, value)
      const active = api.getAppState().activeEmbeddable
      const keepEditing = active?.state === 'active' && active.element?.id === noteId
      api.updateScene({
        elements: elements.map((el) => (el.id === noteId ? updated : el)),
        ...(keepEditing
          ? { appState: { activeEmbeddable: { element: updated, state: 'active' } } }
          : {}),
        captureUpdate: CaptureUpdateAction.NEVER
      })
      markUnsaved()
    },
    [markUnsaved]
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
          scrollY,
          selectedElementIds: { [id]: true }
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
      const worldY = rect
        ? page.y + rect.y + rect.height / 2
        : page.y + page.height / 2
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

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((prev) => !prev)
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

  const removeActiveHighlight = useCallback(() => {
    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const scene = api.getSceneElements()
    const highlight = scene.find((el) => el.id === highlightId)
    if (!highlight || highlight.isDeleted) return

    api.updateScene({
      elements: scene.map((el) =>
        el.id === highlightId ? (newElementWith(el, { isDeleted: true }) as typeof el) : el
      ),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    hideHighlightToolbar()
    markUnsaved()
  }, [hideHighlightToolbar, markUnsaved])

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

      <div className={`absolute inset-0 z-10${textSelectMode ? ' pointer-events-none' : ''}`}>
        <Excalidraw
          excalidrawAPI={(api) => {
            apiRef.current = api
          }}
          initialData={initialData}
          onChange={handleExcalidrawChange}
          onScrollChange={handleScrollChange}
          onPointerDown={handlePointerDown}
          onDuplicate={(nextElements) => fixDuplicatedPdfNotes(nextElements)}
          onLinkOpen={(_element, event) => {
            event.preventDefault()
          }}
          theme="light"
          validateEmbeddable={(link) =>
            typeof link === 'string' && link.startsWith(NOTE_EMBED_LINK) ? true : false
          }
          renderEmbeddable={(element, appState) => {
            if (!isPdfNote(element)) return null
            const editing =
              appState.activeEmbeddable?.element?.id === element.id &&
              appState.activeEmbeddable?.state === 'active'
            return (
              <NoteEmbed
                noteId={element.id}
                plateValue={getNotePlateValue(element)}
                editing={editing}
                onValueChange={updateNotePlateValue}
                onExitEdit={clearActiveEmbeddable}
              />
            )
          }}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              export: false,
              saveAsImage: false,
              toggleTheme: false,
              changeViewBackgroundColor: false
            }
          }}
        />
      </div>

      <div
        ref={highlightToolbarRef}
        className="pointer-events-auto absolute z-90 hidden -translate-x-1/2 -translate-y-full gap-1"
      >
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-neutral-700"
          onClick={addNoteToActiveHighlight}
        >
          Add note
        </button>
        <button
          type="button"
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-red-500"
          onClick={removeActiveHighlight}
        >
          Remove
        </button>
      </div>

      {session && pageCount > 0 && sidebarOpen ? (
        <PdfSidebar
          ref={pdfSidebarRef}
          outline={outline}
          pageCount={pageCount}
          thumbPool={session.thumbPool}
          annotations={annotations}
          initialPage={currentPageRef.current}
          onGoToPage={goToPage}
          onSelectAnnotation={goToAnnotation}
        />
      ) : null}

      {session && pageCount > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-100 flex -translate-x-1/2 items-center gap-2">
          <PageNavigator
            ref={pageNavigatorRef}
            pageCount={pageCount}
            initialPage={currentPageRef.current}
            onGoToPage={goToPage1Based}
            onPrev={goPrevPage}
            onNext={goNextPage}
          />
          {findOpen ? (
            <PdfFindBar
              ref={findBarRef}
              onQueryChange={handleFindQueryChange}
              onNext={() => goToMatch(matchIndexRef.current + 1)}
              onPrev={() => goToMatch(matchIndexRef.current - 1)}
              onClose={closeFind}
            />
          ) : null}
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-3 top-3 z-100">
        <span
          ref={saveChipRef}
          className={`rounded-md px-2 py-1 text-xs shadow ${
            saveStatus === 'error'
              ? 'bg-red-50 text-red-700'
              : saveStatus === 'unsaved'
                ? 'bg-amber-50 text-amber-800'
                : 'bg-white/90 text-neutral-600'
          }`}
        >
          {SAVE_STATUS_LABEL[saveStatus]}
        </span>
      </div>

      <div className="pointer-events-auto absolute bottom-16 right-4 z-100 flex flex-col items-end gap-2">
        <button
          type="button"
          aria-pressed={sidebarOpen}
          aria-label="Toggle pages sidebar"
          disabled={!session}
          className={`rounded-md px-3 py-1.5 text-sm font-medium shadow disabled:cursor-not-allowed disabled:opacity-40 ${
            sidebarOpen
              ? 'bg-white text-neutral-900 ring-2 ring-neutral-900'
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
          onClick={toggleSidebar}
        >
          Pages
        </button>
        <button
          type="button"
          aria-pressed={findOpen}
          disabled={!session}
          className={`rounded-md px-3 py-1.5 text-sm font-medium shadow disabled:cursor-not-allowed disabled:opacity-40 ${
            findOpen
              ? 'bg-white text-neutral-900 ring-2 ring-neutral-900'
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
          onClick={toggleFind}
        >
          Search
        </button>
        <button
          type="button"
          aria-pressed={placeNoteMode}
          disabled={!session}
          className={`rounded-md px-3 py-1.5 text-sm font-medium shadow disabled:cursor-not-allowed disabled:opacity-40 ${
            placeNoteMode
              ? 'bg-white text-neutral-900 ring-2 ring-neutral-900'
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
          onClick={togglePlaceNoteMode}
        >
          Place note
        </button>
        <button
          type="button"
          aria-pressed={textSelectMode}
          disabled={!session}
          className={`rounded-md px-3 py-1.5 text-sm font-medium shadow disabled:cursor-not-allowed disabled:opacity-40 ${
            textSelectMode
              ? 'bg-white text-neutral-900 ring-2 ring-neutral-900'
              : 'bg-neutral-900 text-white hover:bg-neutral-800'
          }`}
          onClick={toggleTextSelectMode}
        >
          Select text
        </button>
      </div>

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
