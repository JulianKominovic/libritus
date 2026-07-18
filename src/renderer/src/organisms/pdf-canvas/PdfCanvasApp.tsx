import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  Excalidraw,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from '@excalidraw/excalidraw/types'
import { readFile } from '@renderer/integrations/fs'
import { setActiveSessionFlush } from '@renderer/lib/pdf-canvas/active-session-flush'
import { PageLayout, worldAABBFromCamera } from '@renderer/lib/pdf-canvas/PageLayout'
import { PagePool } from '@renderer/lib/pdf-canvas/PagePool'
import { PdfDocument } from '@renderer/lib/pdf-canvas/PdfDocument'
import {
  createNoteFromHighlight,
  createWysiwygNote,
  ensureNoteFill,
  findPdfNoteAt,
  getNotePlateValue,
  NOTE_HEIGHT,
  NOTE_WIDTH,
  queryVisibleNotes,
  withNotePlateValue
} from '@renderer/lib/pdf-canvas/pdfNotes'
import { findPdfHighlightAt, selectionToHighlightSkeletons } from '@renderer/lib/pdf-canvas/selectionToHighlights'
import {
  readSession,
  type SaveStatus,
  type SessionSnapshot,
  writeSession
} from '@renderer/lib/pdf-canvas/session'
import { TextLayerPool } from '@renderer/lib/pdf-canvas/TextLayerPool'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { usePdfs } from '@renderer/stores/categories'
import type { Value } from 'platejs'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { NoteLayer, type NoteEditCaret, type NoteHudItem, type NoteLayerHandle } from './NoteLayer'
import { PageNavigator, type PageNavigatorHandle } from './PageNavigator'
import { PdfLayer, type PdfLayerHandle } from './PdfLayer'

import '@excalidraw/excalidraw/index.css'
import '@renderer/excalidraw.css'
import '@renderer/lib/pdf-canvas/textLayer.css'

const INITIAL_CAMERA: CameraState = {
  scrollX: 100,
  scrollY: 60,
  zoom: 1,
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
 * - note overlays / place-note / active note edit
 *
 * Everything else (camera, page, highlight chip) is ref + DOM.
 */
export function PdfCanvasApp({ categoryId, pdfId }: PdfCanvasAppProps) {
  const [, setLocation] = useLocation()
  const containerRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<RuntimeSession | null>(null)
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA)
  const pdfLayerRef = useRef<PdfLayerHandle>(null)
  const pageNavigatorRef = useRef<PageNavigatorHandle>(null)
  const highlightToolbarRef = useRef<HTMLDivElement>(null)
  const activeHighlightIdRef = useRef<string | null>(null)
  const activeNoteIdRef = useRef<string | null>(null)
  const placeNoteModeRef = useRef(false)
  const lastNoteClickRef = useRef<{ id: string; t: number } | null>(null)
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

  const noteLayerRef = useRef<NoteLayerHandle>(null)
  const noteGeometryRef = useRef<
    Array<{ id: string; left: number; top: number; width: number; height: number }>
  >([])
  const [session, setSession] = useState<RuntimeSession | null>(null)
  const [textSelectMode, setTextSelectMode] = useState(false)
  const [placeNoteMode, setPlaceNoteMode] = useState(false)
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null)
  const [editCaret, setEditCaret] = useState<NoteEditCaret | null>(null)
  const [visibleNotes, setVisibleNotes] = useState<NoteHudItem[]>([])
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

  const syncVisibleNotes = useCallback(() => {
    const api = apiRef.current
    const container = containerRef.current
    if (!api || !container) {
      setVisibleNotes((prev) => (prev.length === 0 ? prev : []))
      return
    }

    const appState = api.getAppState()
    const cam = cameraRef.current
    const aabb = worldAABBFromCamera(
      cam.scrollX,
      cam.scrollY,
      cam.zoom,
      cam.viewportWidth,
      cam.viewportHeight
    )
    const padX = (cam.viewportWidth / (cam.zoom || 1)) * 0.25
    const padY = (cam.viewportHeight / (cam.zoom || 1)) * 0.25
    const notes = queryVisibleNotes(api.getSceneElements(), {
      minX: aabb.left - padX,
      minY: aabb.top - padY,
      maxX: aabb.right + padX,
      maxY: aabb.bottom + padY
    })

    const bounds = container.getBoundingClientRect()
    const zoom = appState.zoom.value
    const activeId = activeNoteIdRef.current

    const geometry = notes.map((el) => {
      const topLeft = sceneCoordsToViewportCoords({ sceneX: el.x, sceneY: el.y }, appState)
      return {
        id: el.id,
        left: Math.round(topLeft.x - bounds.left),
        top: Math.round(topLeft.y - bounds.top),
        width: Math.round(el.width * zoom),
        height: Math.round(el.height * zoom)
      }
    })

    // Positions: DOM only — never setState on drag/pan (Excalidraw onChange loop).
    noteGeometryRef.current = geometry
    noteLayerRef.current?.applyGeometry(geometry)

    const next: NoteHudItem[] = notes.map((el) => ({
      id: el.id,
      plateValue: getNotePlateValue(el)
    }))

    // React state only when note set / content changes (not geometry).
    setVisibleNotes((prev) => {
      const merged = next.map((b) => {
        if (b.id === activeId) {
          const old = prev.find((p) => p.id === b.id)
          if (old) return { id: b.id, plateValue: old.plateValue }
        }
        return b
      })
      if (prev.length !== merged.length) return merged
      for (let i = 0; i < prev.length; i++) {
        const a = prev[i]!
        const b = merged[i]!
        if (a.id !== b.id || a.plateValue !== b.plateValue) return merged
      }
      return prev
    })
  }, [])

  // After React mounts/removes note cards, re-apply last geometry (applyGeometry may
  // have run before the new DOM nodes existed).
  useLayoutEffect(() => {
    noteLayerRef.current?.applyGeometry(noteGeometryRef.current)
  }, [visibleNotes])

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
    toolbar.style.display = 'block'
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
        }
      }

      if (activeHighlightIdRef.current) {
        positionHighlightToolbar()
      }
      syncVisibleNotes()
    },
    [positionHighlightToolbar, syncVisibleNotes]
  )

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current != null) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const roundCam = (n: number) => Math.round(n * 1000) / 1000

  const persistSignature = useCallback(
    (elements: readonly unknown[], camera: { scrollX: number; scrollY: number; zoom: number }) =>
      JSON.stringify({
        elements,
        camera: {
          scrollX: roundCam(camera.scrollX),
          scrollY: roundCam(camera.scrollY),
          zoom: roundCam(camera.zoom)
        }
      }),
    []
  )

  const currentPersistSignature = useCallback((): string | null => {
    const api = apiRef.current
    if (!api) return null
    const elements = JSON.parse(
      JSON.stringify(api.getSceneElements().filter((el) => !el.isDeleted))
    ) as unknown[]
    const cam = cameraRef.current
    return persistSignature(elements, cam)
  }, [persistSignature])

  const buildSnapshot = useCallback((): SessionSnapshot | null => {
    const api = apiRef.current
    if (!api || !readyRef.current) return null
    const cam = cameraRef.current
    const elements = JSON.parse(
      JSON.stringify(api.getSceneElements().filter((el) => !el.isDeleted))
    ) as unknown[]
    return {
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
  }, [pdfId])

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
  }, [buildSnapshot, categoryId, pdfId, persistSignature, syncSaveChip])

  const markUnsaved = useCallback(() => {
    if (!readyRef.current || restoringRef.current) return
    const sig = currentPersistSignature()
    if (sig == null) return

    if (sig === lastSavedSigRef.current) {
      if (dirtyRef.current) {
        dirtyRef.current = false
        pendingSigRef.current = ''
        clearSaveTimer()
        syncSaveChip('saved')
      }
      return
    }

    if (dirtyRef.current && sig === pendingSigRef.current) return

    dirtyRef.current = true
    pendingSigRef.current = sig
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
    await prev.doc.destroy()
    sessionRef.current = null
    setSession(null)
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
    clearSaveTimer()
    syncSaveChip('saved')
    setLoadError(null)

    const open = async () => {
      await destroyRuntimeSession()
      clearScene()

      try {
        const [bytes, snapshot] = await Promise.all([readFile(`${pdfId}.pdf`), readSession(pdfId)])
        if (cancelled || generation !== openGenerationRef.current) return

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
        if (cancelled || generation !== openGenerationRef.current) {
          await doc.destroy()
          return
        }

        const layout = new PageLayout(doc.pageSizes)
        const pool = new PagePool(doc)
        const textPool = new TextLayerPool(doc)
        const next: RuntimeSession = { doc, layout, pool, textPool }
        sessionRef.current = next
        setSession(next)

        const cam = snapshot?.camera
        const scrollX = cam?.scrollX ?? INITIAL_CAMERA.scrollX
        const scrollY = cam?.scrollY ?? INITIAL_CAMERA.scrollY
        const zoom = (cam?.zoom ?? INITIAL_CAMERA.zoom) as NormalizedZoomValue
        const elements =
          snapshot?.elements && Array.isArray(snapshot.elements)
            ? (
                snapshot.elements as ReturnType<ExcalidrawImperativeAPI['getSceneElements']>
              ).map(ensureNoteFill)
            : []

        restoringRef.current = true
        pushCamera({ scrollX, scrollY, zoom })

        const applyScene = () => {
          const api = apiRef.current
          if (!api) return false
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
              if (cancelled || generation !== openGenerationRef.current) {
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

        if (cancelled || generation !== openGenerationRef.current) return

        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
        })
        if (cancelled || generation !== openGenerationRef.current) return

        restoringRef.current = false
        readyRef.current = true
        dirtyRef.current = false
        pendingSigRef.current = ''
        lastSavedSigRef.current =
          currentPersistSignature() ?? persistSignature(elements, { scrollX, scrollY, zoom })
        syncSaveChip('saved')
        syncVisibleNotes()
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
    persistSignature,
    pushCamera,
    syncSaveChip,
    syncVisibleNotes
  ])

  // Flush + tear down when leaving the route (sidebar nav, etc.).
  useEffect(() => {
    return () => {
      clearSaveTimer()
      if (dirtyRef.current && apiRef.current) {
        const api = apiRef.current
        const cam = cameraRef.current
        const elements = JSON.parse(
          JSON.stringify(api.getSceneElements().filter((el) => !el.isDeleted))
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
      void current.doc.destroy()
      sessionRef.current = null
    }
  }, [categoryId, clearSaveTimer, pdfId])

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

  const handleExcalidrawChange = useCallback(() => {
    markUnsaved()
    syncVisibleNotes()
  }, [markUnsaved, syncVisibleNotes])

  const setActiveNote = useCallback(
    (noteId: string | null, caret: NoteEditCaret | null = null) => {
      activeNoteIdRef.current = noteId
      setActiveNoteId(noteId)
      setEditCaret(noteId ? caret : null)
      // Leaving edit: lift plateValue freeze and pull latest content from the scene.
      if (noteId == null) {
        syncVisibleNotes()
      }
    },
    [syncVisibleNotes]
  )

  const toggleTextSelectMode = useCallback(() => {
    setTextSelectMode((prev) => {
      const next = !prev
      if (next) {
        hideHighlightToolbar()
        setPlaceNoteMode(false)
        placeNoteModeRef.current = false
        setActiveNote(null)
      } else {
        window.getSelection()?.removeAllRanges()
      }
      return next
    })
  }, [hideHighlightToolbar, setActiveNote])

  const togglePlaceNoteMode = useCallback(() => {
    setPlaceNoteMode((prev) => {
      const next = !prev
      placeNoteModeRef.current = next
      if (next) {
        setTextSelectMode(false)
        hideHighlightToolbar()
        setActiveNote(null)
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
  }, [hideHighlightToolbar, setActiveNote])

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
      api.updateScene({
        elements: elements.map((el) => (el.id === noteId ? updated : el)),
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

  const goToPage1Based = useCallback(
    (page1Based: number) => {
      goToPage(page1Based - 1)
    },
    [goToPage]
  )

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
        placeNoteModeRef.current = false
        setPlaceNoteMode(false)
        // Select only — edit requires double-click. Activating edit here puts the HUD
        // on pointer-events-auto and blocks Excalidraw drag.
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
        markUnsaved()
        syncVisibleNotes()
        return
      }

      const noteHit = findPdfNoteAt(api.getSceneElements(), sceneX, sceneY)
      if (noteHit) {
        const now = Date.now()
        const last = lastNoteClickRef.current
        const isDouble =
          last != null && last.id === noteHit.id && now - last.t < 400
        lastNoteClickRef.current = { id: noteHit.id, t: now }
        if (isDouble) {
          const screen = sceneCoordsToViewportCoords(
            { sceneX, sceneY },
            api.getAppState()
          )
          setActiveNote(noteHit.id, { clientX: screen.x, clientY: screen.y })
        }
        hideHighlightToolbar()
        return
      }

      lastNoteClickRef.current = null
      setActiveNote(null)

      const hit = findPdfHighlightAt(api.getSceneElements(), sceneX, sceneY)
      if (hit) {
        showHighlightToolbar(hit.id)
      } else {
        hideHighlightToolbar()
      }
    },
    [hideHighlightToolbar, markUnsaved, setActiveNote, showHighlightToolbar, syncVisibleNotes]
  )

  const addNoteToActiveHighlight = useCallback(() => {
    const api = apiRef.current
    const highlightId = activeHighlightIdRef.current
    if (!api || !highlightId) return

    const highlight = api.getSceneElements().find((el) => el.id === highlightId)
    if (!highlight) return

    const { newElements } = createNoteFromHighlight(highlight)

    api.updateScene({
      elements: [...api.getSceneElements(), ...newElements],
      appState: {
        selectedElementIds: Object.fromEntries(
          newElements.filter((el) => el.type === 'rectangle').map((el) => [el.id, true])
        )
      },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY
    })

    // Select only — edit requires double-click (same as free place).
    hideHighlightToolbar()
    markUnsaved()
    syncVisibleNotes()
  }, [hideHighlightToolbar, markUnsaved, syncVisibleNotes])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (activeNoteId) {
        setActiveNote(null)
        event.preventDefault()
        return
      }
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
  }, [activeNoteId, setActiveNote])

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
      className={`relative h-full w-full overflow-hidden bg-neutral-200${
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
          theme="light"
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

      {/* Above Excalidraw: content visible over solid placeholder; pointer-events off until edit. */}
      {session ? (
        <NoteLayer
          ref={noteLayerRef}
          notes={visibleNotes}
          activeNoteId={activeNoteId}
          editCaret={editCaret}
          onValueChange={updateNotePlateValue}
        />
      ) : null}

      <div
        ref={highlightToolbarRef}
        className="pointer-events-auto absolute z-[90] -translate-x-1/2 -translate-y-full"
        style={{ display: 'none' }}
      >
        <button
          type="button"
          className="rounded-md bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white shadow hover:bg-neutral-800"
          onClick={addNoteToActiveHighlight}
        >
          Add note
        </button>
      </div>

      {session && pageCount > 0 ? (
        <div className="pointer-events-none absolute bottom-3 left-1/2 z-[100] -translate-x-1/2">
          <PageNavigator
            ref={pageNavigatorRef}
            pageCount={pageCount}
            initialPage={currentPageRef.current}
            onGoToPage={goToPage1Based}
            onPrev={goPrevPage}
            onNext={goNextPage}
          />
        </div>
      ) : null}

      <div className="pointer-events-none absolute right-3 top-3 z-[100]">
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

      <div className="pointer-events-auto absolute bottom-16 right-4 z-[100] flex flex-col items-end gap-2">
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
        <div className="pointer-events-none absolute inset-0 z-[110] flex items-center justify-center bg-neutral-200/80">
          <p className="rounded-md bg-white px-4 py-2 text-sm text-red-700 shadow">{loadError}</p>
        </div>
      ) : null}

      {!session && !loadError ? (
        <div className="pointer-events-none absolute inset-0 z-[5] flex items-center justify-center">
          <p className="text-sm text-neutral-500">Loading PDF…</p>
        </div>
      ) : null}
    </div>
  )
}
