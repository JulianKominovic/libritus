import {
  CaptureUpdateAction,
  Excalidraw,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
  NormalizedZoomValue
} from '@excalidraw/excalidraw/types'
import { readFile } from '@renderer/integrations/fs'
import { browserShow } from '@renderer/integrations/webBrowser'
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
import { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import { PagePool } from '@renderer/lib/pdf-canvas/PagePool'
import {
  pageWorldScale,
  renderScaleForWorld,
  scaleSessionScene
} from '@renderer/lib/pdf-canvas/pageWorldScale'
import { PdfDocument } from '@renderer/lib/pdf-canvas/PdfDocument'
import {
  createNoteFromHighlight,
  fixDuplicatedPdfNotes,
  isPdfNote,
  normalizePdfNote,
  NOTE_EMBED_LINK,
  syncPdfNoteArrows
} from '@renderer/lib/pdf-canvas/pdfNotes'
import { loadOutline, type OutlineNode } from '@renderer/lib/pdf-canvas/pdfOutline'
// RAG parked — restore with enqueue in open effect (see src/main/ai/index.ts).
// import { buildTextChunks, extractPageTexts } from '@renderer/lib/pdf-canvas/pdfRag'
import { EmbedPDF } from '@embedpdf/core/react'
import type { PdfEngine } from '@embedpdf/engines'
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react'
import { useSelectionCapability } from '@embedpdf/plugin-selection/react'
import { useLang } from '@renderer/i18n/lang-context'
import type { TranslationsKeys } from '@renderer/i18n/translations-keys'
import { getPdfEngine } from '@renderer/lib/pdf-canvas/embedpdfEngine'
import { EMBEDPDF_CANVAS_PLUGINS } from '@renderer/lib/pdf-canvas/embedpdfPlugins'
import { normalizePdfClip } from '@renderer/lib/pdf-canvas/pdfClip'
import {
  attachmentFileIdsFromSearchCaptures,
  createSearchCaptureFromHighlight,
  fixDuplicatedPdfSearchCaptures,
  isPdfSearchCapture,
  normalizePdfSearchCapture,
  SEARCH_CAPTURE_EMBED_LINK,
  syncPdfSearchArrows
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import {
  readSession,
  SESSION_VERSION,
  writeSession,
  type SessionSnapshot
} from '@renderer/lib/pdf-canvas/session'
import { shouldApplyOpenResult } from '@renderer/lib/pdf-canvas/sessionOpen'
import {
  combinePersistSignatures,
  elementsVersionKey,
  persistCameraSignature,
  persistElementsSignature,
  persistPlateSignature
} from '@renderer/lib/pdf-canvas/sessionPersist'
import {
  clearSessionPersistFreeze,
  isSessionPersistFrozen
} from '@renderer/lib/pdf-canvas/sessionPersistFreeze'
import { stripElbowArrows } from '@renderer/lib/pdf-canvas/stripElbowArrows'
import { shouldSuppressUnlockPopup } from '@renderer/lib/pdf-canvas/suppressUnlockPopup'
import { ThumbPool } from '@renderer/lib/pdf-canvas/ThumbPool'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import { useSettings } from '@renderer/stores/settings'
import { Globe, Search, StickyNote } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'wouter'
import { HighlightToolbar } from './HighlightToolbar'
import { PageNavigator, type PageNavigatorHandle } from './PageNavigator'
import { PdfFindBar } from './PdfFindBar'
import { PdfLayer, type PdfLayerHandle } from './PdfLayer'
import { PdfSidebar, type PdfSidebarHandle } from './PdfSidebar'
import { SearchBrowseHint } from './SearchBrowseHint'
import { liveExcalidrawApi } from './selectionTool'
import { INITIAL_CAMERA, usePdfCamera } from './usePdfCamera'
import { usePdfFindBar } from './usePdfFindBar'
import { usePdfHighlights } from './usePdfHighlights'
import { usePdfHostScene } from './usePdfHostScene'
import { usePdfNavigation } from './usePdfNavigation'
import { usePdfNotes } from './usePdfNotes'
import { SAVE_STATUS_LABEL, usePdfPersistence } from './usePdfPersistence'
import { usePdfTextPass } from './usePdfTextPass'
import { useSearchCaptureBrowser } from './useSearchCaptureBrowser'

import '@excalidraw/excalidraw/index.css'
import '@renderer/excalidraw.css'

type RuntimeSession = {
  doc: PdfDocument
  documentId: string
  layout: PageLayout
  pool: PagePool
  thumbPool: ThumbPool
}

type PdfCanvasAppProps = {
  categoryId: string
  pdfId: string
}

/**
 * Engine + EmbedPDF host (DocumentManager / InteractionManager / Selection).
 * Inner session opens the buffer via DocumentManager so Selection can resolve it.
 */
export function PdfCanvasApp(props: PdfCanvasAppProps) {
  const [engine, setEngine] = useState<PdfEngine<Blob> | null>(null)

  useEffect(() => {
    let cancelled = false
    void getPdfEngine()
      .then((e) => {
        if (!cancelled) setEngine(e)
      })
      .catch((err) => {
        console.error('PDFium engine failed', err)
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (!engine) {
    return (
      <div data-pdf-canvas-root className="relative h-full w-full overflow-hidden bg-morphing-50" />
    )
  }

  return (
    <EmbedPDF engine={engine} plugins={EMBEDPDF_CANVAS_PLUGINS}>
      <PdfCanvasAppInner {...props} engine={engine} />
    </EmbedPDF>
  )
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
 * Text select: selection tool + miss → `.pdf-text-pass` (host PE-none → SelectionLayer).
 */
function PdfCanvasAppInner({
  categoryId,
  pdfId,
  engine
}: PdfCanvasAppProps & { engine: PdfEngine<Blob> }) {
  const [, setLocation] = useLocation()
  const { t } = useLang()
  // Stable identity for t so callbacks in the open-effect deps don't change on
  // language switch (a changed dep would re-run the whole open/restore effect).
  const tRef = useRef(t)
  tRef.current = t
  const { provides: documentManager } = useDocumentManagerCapability()
  const { provides: selectionCapability } = useSelectionCapability()
  const documentManagerRef = useRef(documentManager)
  const selectionCapabilityRef = useRef(selectionCapability)
  documentManagerRef.current = documentManager
  selectionCapabilityRef.current = selectionCapability

  const containerRef = useRef<HTMLDivElement>(null)
  const excalidrawHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<RuntimeSession | null>(null)

  const clearEmbedSelection = useCallback(() => {
    const id = sessionRef.current?.documentId
    const cap = selectionCapabilityRef.current
    if (id && cap) cap.clear(id)
  }, [])

  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null)
  const pdfLayerRef = useRef<PdfLayerHandle>(null)
  const pageNavigatorRef = useRef<PageNavigatorHandle>(null)
  const pdfSidebarRef = useRef<PdfSidebarHandle>(null)
  const searchBrowseHintRef = useRef<HTMLDivElement>(null)
  /** Selected promoted search-capture image (hint chip); null when hidden. */
  const activeSearchImageIdRef = useRef<string | null>(null)
  /** Keep PE pass-through until pointerup so mid-drag over a shape doesn't steal text select. */
  const textSelectGestureRef = useRef(false)
  /** Primary-button (or any) pointer down — cheap onChange path while dragging embeds. */
  const pointerButtonsDownRef = useRef(false)
  /** Cheap scene version key — schedules arrow sync only when elements actually moved. */
  const sceneKeyRef = useRef('')
  const pdfTextPassRef = useRef(false)
  const readyRef = useRef(false)
  const restoringRef = useRef(false)
  const openGenerationRef = useRef(0)
  const persistedAttachmentIdsRef = useRef(new Set<string>())
  /** Note ids Excalidraw has already validated (may have link stripped for UI). */
  const noteIdsRef = useRef(new Set<string>())
  /** Clears Excalidraw UI state that is disabled for the PDF canvas. */
  const unlockSuppressUnsubRef = useRef<(() => void) | null>(null)

  const { cameraRef, currentPageRef, pushCameraRaw } = usePdfCamera({
    sessionRef,
    containerRef,
    pdfLayerRef,
    pageNavigatorRef,
    pdfSidebarRef
  })

  const showPdfOutline = useSettings((s) => s.showPdfOutline)

  const [session, setSession] = useState<RuntimeSession | null>(null)
  const [outline, setOutline] = useState<OutlineNode[]>([])
  const [annotations, setAnnotations] = useState<AnnotationListItem[]>([])
  const annotationsSigRef = useRef('')
  const [loadError, setLoadError] = useState<{ key?: TranslationsKeys; message?: string } | null>(
    null
  )

  const initialData = useMemo(
    () => ({
      appState: {
        viewBackgroundColor: 'transparent',
        currentItemArrowType: 'sharp' as const,
        boxSelectionMode: 'overlap' as const,
        scrollX: INITIAL_CAMERA.scrollX,
        scrollY: INITIAL_CAMERA.scrollY,
        zoom: { value: INITIAL_CAMERA.zoom as NormalizedZoomValue }
      },
      elements: []
    }),
    []
  )

  const {
    saveStatus,
    saveChipRef,
    dirtyRef,
    pendingPlateByNoteIdRef,
    lastSavedSigRef,
    pendingSigRef,
    syncSaveChip,
    clearSaveTimer,
    sceneElementsForPersist,
    stripPdfNoteLinksAfterValidate,
    queueStripPdfNoteLinks,
    resetSignatureCaches,
    currentPersistSignature,
    markUnsaved,
    flushSave
  } = usePdfPersistence({
    pdfId,
    categoryId,
    apiRef,
    sessionRef,
    cameraRef,
    currentPageRef,
    readyRef,
    restoringRef,
    pointerButtonsDownRef
  })

  const hideSearchBrowseHint = useCallback(() => {
    activeSearchImageIdRef.current = null
    const hint = searchBrowseHintRef.current
    if (hint) hint.style.display = 'none'
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
    highlightToolbarRef,
    activeHighlightIdRef,
    pendingHighlightRef,
    activeHighlightColor,
    highlightToolbarPending,
    hideHighlightToolbar,
    positionHighlightToolbar,
    showHighlightToolbar,
    showPendingHighlightToolbar,
    commitPendingHighlight,
    copyActiveHighlightText,
    removeActiveHighlight,
    recolorActiveHighlight
  } = usePdfHighlights({
    apiRef,
    containerRef,
    clearEmbedSelection,
    focusCanvasRoot,
    markUnsaved
  })

  const {
    placeNoteModeRef,
    placeBrowserModeRef,
    placeNoteMode,
    placeBrowserMode,
    exitPlaceModes,
    togglePlaceNoteMode,
    togglePlaceBrowserMode,
    renderEmbeddable
  } = usePdfNotes({
    apiRef,
    pendingPlateByNoteIdRef,
    clearActiveEmbeddable,
    hideHighlightToolbar,
    setPdfTextPass,
    markUnsaved
  })

  const { openSearchBrowser, disposeBrowser, syncBrowserTarget } = useSearchCaptureBrowser({
    apiRef,
    excalidrawHostRef,
    persistedAttachmentIdsRef,
    dirtyRef,
    syncSaveChip
  })

  /** Promoted image under pointer (reading mode) — drives browse chip without selection. */
  const hoveredSearchImageIdRef = useRef<string | null>(null)

  const positionSearchBrowseHint = useCallback(() => {
    const hint = searchBrowseHintRef.current
    const api = apiRef.current
    const container = containerRef.current
    const imageId = activeSearchImageIdRef.current
    if (!hint || !api || !container || !imageId) return

    const el = api.getSceneElements().find((e) => e.id === imageId)
    if (!el || el.isDeleted || !isPdfSearchCapture(el) || el.type !== 'image') {
      hideSearchBrowseHint()
      return
    }

    const appState = api.getAppState()
    // Center of card — matches EmbedActivateHint on placeholders.
    const mid = sceneCoordsToViewportCoords(
      { sceneX: el.x + el.width / 2, sceneY: el.y + el.height / 2 },
      appState
    )
    const bounds = container.getBoundingClientRect()
    hint.style.left = `${mid.x - bounds.left}px`
    hint.style.top = `${mid.y - bounds.top}px`
    hint.style.display = 'flex'
  }, [hideSearchBrowseHint])

  /** Show chip for hovered or single-selected promoted search image. */
  const lastHintSelectionKeyRef = useRef('')
  const lastHintFullKeyRef = useRef('')
  const syncSearchBrowseHint = useCallback(() => {
    const api = apiRef.current
    if (!api) {
      lastHintSelectionKeyRef.current = ''
      lastHintFullKeyRef.current = ''
      hideSearchBrowseHint()
      return
    }

    const selected = api.getAppState().selectedElementIds ?? {}
    const selectedIds = Object.keys(selected).filter((id) => selected[id])
    const selectionKey = `${hoveredSearchImageIdRef.current ?? ''}|${selectedIds.join(',')}`
    // Hover spam / repeated onChanges: unchanged hover+selection → skip the scene scan.
    if (selectionKey === lastHintSelectionKeyRef.current) return
    lastHintSelectionKeyRef.current = selectionKey

    const pickImageId = (id: string | null | undefined): string | null => {
      if (!id) return null
      const el = api.getSceneElements().find((e) => e.id === id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el) || el.type !== 'image') return null
      return el.id
    }

    const id =
      pickImageId(hoveredSearchImageIdRef.current) ??
      (selectedIds.length === 1 ? pickImageId(selectedIds[0]) : null)

    // Element identity can change under an unchanged selection (embed → image).
    const fullKey = `${selectionKey}|${id ?? ''}`
    if (fullKey === lastHintFullKeyRef.current) return
    lastHintFullKeyRef.current = fullKey

    if (!id) {
      hideSearchBrowseHint()
      return
    }
    activeSearchImageIdRef.current = id
    positionSearchBrowseHint()
  }, [hideSearchBrowseHint, positionSearchBrowseHint])

  const pushCamera = useCallback(
    (patch: Partial<CameraState>) => {
      pushCameraRaw(patch)
      // No-op safe: each positioner returns early when nothing is active.
      positionHighlightToolbar()
      positionSearchBrowseHint()
    },
    [pushCameraRaw, positionHighlightToolbar, positionSearchBrowseHint]
  )

  const { goToPage, goToAnnotation, goToPage1Based, goPrevPage, goNextPage, handleScrollChange } =
    usePdfNavigation({
      apiRef,
      sessionRef,
      containerRef,
      cameraRef,
      currentPageRef,
      pushCamera,
      markUnsaved
    })

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
    hideHighlightToolbar()
    hideSearchBrowseHint()
    clearEmbedSelection()
    disposeBrowser()
    // Drop React/session refs before tearing down the worker so a stale PdfLayer
    // syncVisible cannot call getPage on a destroyed transport.
    sessionRef.current = null
    setSession(null)
    setOutline([])
    prev.pool.destroy()
    prev.thumbPool.destroy()
    const docs = documentManagerRef.current
    if (docs?.isDocumentOpen(prev.documentId)) {
      try {
        await docs.closeDocument(prev.documentId).toPromise()
      } catch {
        /* already closed */
      }
    }
    await prev.doc.destroy()
  }, [clearEmbedSelection, disposeBrowser, hideHighlightToolbar, hideSearchBrowseHint])

  const clearScene = useCallback(() => {
    apiRef.current?.updateScene({
      elements: [],
      captureUpdate: CaptureUpdateAction.NEVER
    })
  }, [])

  useEffect(() => {
    if (!documentManager) return

    const generation = ++openGenerationRef.current
    let cancelled = false
    clearSessionPersistFreeze()
    readyRef.current = false
    dirtyRef.current = false
    lastSavedSigRef.current = ''
    pendingSigRef.current = ''
    resetSignatureCaches()
    sceneKeyRef.current = ''
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
          setLoadError({ key: 'canvas_error_pdf_not_found' })
          return
        }

        // Copy into a fresh ArrayBuffer — engine may transfer the buffer to the worker.
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer

        const docs = documentManagerRef.current
        if (!docs) {
          setLoadError({ key: 'canvas_error_doc_manager_not_ready' })
          return
        }

        const openResp = await docs
          .openDocumentBuffer({
            buffer: ab,
            name: `${pdfId}.pdf`,
            documentId: pdfId,
            autoActivate: true
          })
          .toPromise()
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
          try {
            await docs.closeDocument(openResp.documentId).toPromise()
          } catch {
            /* ignore */
          }
          return
        }

        const handle = await openResp.task.toPromise()
        if (!shouldApplyOpenResult(cancelled, generation, openGenerationRef.current)) {
          try {
            await docs.closeDocument(openResp.documentId).toPromise()
          } catch {
            /* ignore */
          }
          return
        }

        const doc = PdfDocument.wrap(engine, handle, { ownsClose: false })
        const documentId = openResp.documentId
        const { scale: worldScale, sizes: worldSizes } = pageWorldScale(doc.pageSizes)
        const layout = new PageLayout(worldSizes, undefined, worldScale)
        const pool = new PagePool(doc, { renderScale: renderScaleForWorld(worldScale) })
        const thumbPool = new ThumbPool(doc)
        const next: RuntimeSession = { doc, documentId, layout, pool, thumbPool }
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
            ? stripElbowArrows(
                syncPdfSearchArrows(
                  syncPdfNoteArrows(
                    (
                      migrated.elements as ReturnType<ExcalidrawImperativeAPI['getSceneElements']>
                    ).map((el) => normalizePdfClip(normalizePdfSearchCapture(normalizePdfNote(el))))
                  ).elements
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
              viewBackgroundColor: 'transparent',
              // Elbow arrows hard-fail past ±1e6 scene coords (tall PDFs).
              currentItemArrowType: 'sharp'
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
          currentPersistSignature() ??
          (combinePersistSignatures(
            persistElementsSignature(elements),
            persistPlateSignature(new Map()),
            persistCameraSignature({ scrollX, scrollY, zoom })
          ) ?? '')
        syncSaveChip('saved')
      } catch (err) {
        console.error(err)
        const message = err instanceof Error ? err.message : null
        setLoadError(message ? { message } : { key: 'canvas_error_open_failed' })
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
    documentManager,
    engine,
    pdfId,
    pushCamera,
    resetSignatureCaches,
    stripPdfNoteLinksAfterValidate,
    syncAnnotations,
    syncSaveChip
  ])

  useEffect(() => {
    return () => {
      unlockSuppressUnsubRef.current?.()
      unlockSuppressUnsubRef.current = null
    }
  }, [])

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
      hideHighlightToolbar()
      hideSearchBrowseHint()
      clearEmbedSelection()
      sessionRef.current = null
      current.pool.destroy()
      current.thumbPool.destroy()
      const docs = documentManagerRef.current
      if (docs?.isDocumentOpen(current.documentId)) {
        void docs
          .closeDocument(current.documentId)
          .toPromise()
          .catch(() => {})
      }
      void current.doc.destroy()
    }
  }, [
    categoryId,
    clearEmbedSelection,
    clearSaveTimer,
    disposeBrowser,
    hideHighlightToolbar,
    hideSearchBrowseHint,
    pdfId,
    sceneElementsForPersist
  ])

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

  const { scheduleHostArrowSync, scheduleHostSceneMaintenance, endPointerGesture } =
    usePdfHostScene({
      apiRef,
      restoringRef,
      pointerButtonsDownRef,
      noteIdsRef,
      pendingPlateByNoteIdRef,
      queueStripPdfNoteLinks,
      syncAnnotations,
      syncSearchBrowseHint,
      markUnsaved
    })

  const handleExcalidrawChange = useCallback(
    (
      _elements: unknown,
      appState: {
        activeEmbeddable?: { element?: { id: string } | null; state: string } | null
      },
      files: BinaryFiles
    ) => {
      // Cheap empty check (no Object.keys alloc); persistNewBinaryFiles dedupes by id set.
      if (files != null) {
        for (const id in files) {
          if (Object.prototype.hasOwnProperty.call(files, id)) {
            void persistNewBinaryFiles(files, persistedAttachmentIdsRef.current)
            break
          }
        }
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

          // Selection-driven browse chip — must run before hover early-return
          // (pointermove over note/search center emits hover and would otherwise leave a ghost chip).
          syncSearchBrowseHint()
          // Browser Update-target = single selected pdfSearchCapture (identity only).
          syncBrowserTarget(api)

          // Force sharp before draw starts — A while arrow tool cycles onto elbow.
          // AppState-only; safe mid-draw (does not rewrite the in-progress element).
          if (api.getAppState().currentItemArrowType === 'elbow') {
            api.updateScene({
              appState: { currentItemArrowType: 'sharp' },
              captureUpdate: CaptureUpdateAction.NEVER
            })
          }

          // ponytail: never host-updateScene mid-draw — fights Excalidraw's in-progress
          // linear element (bindings to notes stay intact; we just don't rewrite the scene).
          const drawing =
            api.getAppState().newElement != null || api.getAppState().multiElement != null
          if (drawing) {
            markUnsaved()
            return
          }

          // Host arrows: rAF-coalesced (one updateScene per frame while dragging embeds).
          // IncludingDeleted so soft-deleted arrows revive after Ctrl+Z. Schedule only
          // when elements actually moved (versionNonce key) — hover spam passes the
          // same key and must not pay the full sync scan every frame.
          const scene = api.getSceneElementsIncludingDeleted()
          const sceneKey = elementsVersionKey(scene)
          if (sceneKey !== sceneKeyRef.current) {
            sceneKeyRef.current = sceneKey
            scheduleHostArrowSync()
          }

          // Excalidraw setStates activeEmbeddable "hover" on every pointermove over the
          // note center third (no equality guard) → onChange spam. Skip the rest
          // (including markUnsaved — pure hover must not stringify the scene).
          if (appState.activeEmbeddable?.state === 'hover') {
            return
          }

          // Drag hot path: arrows scheduled; skip O(n) scans + full persist until pointerup.
          if (pointerButtonsDownRef.current) {
            if (activeSearchImageIdRef.current) positionSearchBrowseHint()
            markUnsaved()
            return
          }

          // Chip follows element-only moves (keyboard nudges) that change no
          // hover/selection — syncSearchBrowseHint dedupes those away.
          if (activeSearchImageIdRef.current) positionSearchBrowseHint()

          // Full maintenance (elbow ban / relock / repair / plate merge) — one pass
          // per frame; pointerup flushes it immediately via endPointerGesture.
          scheduleHostSceneMaintenance()
        }
      }
      markUnsaved()
    },
    [
      hideHighlightToolbar,
      markUnsaved,
      positionSearchBrowseHint,
      scheduleHostArrowSync,
      scheduleHostSceneMaintenance,
      syncBrowserTarget,
      syncSearchBrowseHint
    ]
  )

  const pageCount = session?.doc.pageCount ?? 0

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

  const { handlePointerDown } = usePdfTextPass({
    apiRef,
    sessionRef,
    pdfLayerRef,
    containerRef,
    excalidrawHostRef,
    pointerButtonsDownRef,
    textSelectGestureRef,
    pdfTextPassRef,
    activeHighlightIdRef,
    pendingHighlightRef,
    hoveredSearchImageIdRef,
    placeNoteModeRef,
    placeBrowserModeRef,
    syncSearchBrowseHint,
    selectionCapability,
    session,
    setPdfTextPass,
    clearActiveEmbeddable,
    focusCanvasRoot,
    hideHighlightToolbar,
    showHighlightToolbar,
    showPendingHighlightToolbar,
    clearEmbedSelection,
    markUnsaved,
    queueStripPdfNoteLinks,
    openSearchBrowser,
    goToAnnotation,
    goToPage,
    onHttpLink: (url) => void browserShow({ url }),
    exitPlaceModes,
    endPointerGesture
  })

  return (
    <div
      ref={containerRef}
      data-pdf-canvas-root
      tabIndex={-1}
      className="relative h-full w-full overflow-hidden bg-morphing-50"
      onKeyDownCapture={(event) => {
        if (
          (event.metaKey || event.ctrlKey) &&
          event.key.toLowerCase() === 'f' &&
          event.target instanceof Node &&
          excalidrawHostRef.current?.contains(event.target)
        ) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}
    >
      {session ? (
        <PdfLayer
          ref={pdfLayerRef}
          layout={session.layout}
          pool={session.pool}
          doc={session.doc}
          documentId={session.documentId}
          onInternalLink={goToPage}
          onHttpLink={(url) => void browserShow({ url })}
        />
      ) : null}

      <div ref={excalidrawHostRef} className="excalidraw-host absolute inset-0 z-10">
        <Excalidraw
          onExcalidrawAPI={(api) => {
            apiRef.current = api
          }}
          onInitialize={(api) => {
            unlockSuppressUnsubRef.current?.()
            const unsubscribeUnlockSuppress = api.onStateChange('activeLockedId', (id) => {
              if (!shouldSuppressUnlockPopup(id, api.getSceneElements())) return
              api.updateScene({
                appState: { activeLockedId: null },
                captureUpdate: CaptureUpdateAction.NEVER
              })
            })
            const unsubscribeDefaultSidebar = api.onStateChange('openSidebar', (openSidebar) => {
              if (!openSidebar) return
              api.updateScene({
                appState: { openSidebar: null },
                captureUpdate: CaptureUpdateAction.NEVER
              })
            })
            unlockSuppressUnsubRef.current = () => {
              unsubscribeUnlockSuppress()
              unsubscribeDefaultSidebar()
            }
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
        <div className="pointer-events-none absolute left-0 top-[102px] z-10 grid grid-cols-[1fr_2fr_1fr] gap-8 2xl:grid-cols-3 w-full h-10 items-center 2xl:gap-12">
          <div
            role="toolbar"
            aria-label={t('canvas_tools_aria')}
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
              aria-label={t('canvas_search_aria')}
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
              aria-label={t('canvas_place_note_aria')}
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
              aria-label={t('canvas_place_browser_aria')}
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
      <SearchBrowseHint ref={searchBrowseHintRef} />

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
        <div className="pointer-events-none absolute left-3 top-[62px] z-100">
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
          <p className="rounded-md bg-white px-4 py-2 text-sm text-red-700 shadow">
            {loadError.key ? t(loadError.key) : loadError.message}
          </p>
        </div>
      ) : null}

      {!session && !loadError ? (
        <div className="pointer-events-none absolute inset-0 z-5 flex items-center justify-center">
          <p className="text-sm text-neutral-500">{t('canvas_loading_pdf')}</p>
        </div>
      ) : null}
    </div>
  )
}
