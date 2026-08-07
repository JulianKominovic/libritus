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
import { fetchImageUrl } from '@renderer/integrations/ipc'
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
  mimeToExt,
  persistNewBinaryFiles
} from '@renderer/lib/pdf-canvas/attachments'
import {
  dataTransferLooksLikeBrowserImageDrag,
  dataTransferLooksLikeBrowserUrlOrImageDrag,
  imageUrlFromDataTransfer
} from '@renderer/lib/pdf-canvas/browserImageDrop'
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
import { EmbedPDF } from '@embedpdf/core/react'
import type { PdfEngine } from '@embedpdf/engines'
import { useDocumentManagerCapability } from '@embedpdf/plugin-document-manager/react'
import { useSelectionCapability } from '@embedpdf/plugin-selection/react'
import { getPdfEngine } from '@renderer/lib/pdf-canvas/embedpdfEngine'
import { EMBEDPDF_CANVAS_PLUGINS } from '@renderer/lib/pdf-canvas/embedpdfPlugins'
import {
  attachmentFileIdsFromSearchCaptures,
  createSearchCapture,
  createSearchCaptureFromHighlight,
  droppedHttpUrlForSearchCapture,
  findPdfSearchCaptureAt,
  fixDuplicatedPdfSearchCaptures,
  getSearchCaptureQuery,
  isPdfSearchCapture,
  normalizePdfSearchCapture,
  pastedHttpUrlForSearchCapture,
  SEARCH_CAPTURE_EMBED_LINK,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_LANDSCAPE,
  SEARCH_CAPTURE_PORTRAIT,
  SEARCH_CAPTURE_WIDTH,
  syncPdfSearchArrows
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { PASS_HIT_PAD_PX } from '@renderer/lib/pdf-canvas/pdfTextPassHitPad'
import { findSceneElementAt, holdsPdfTextPassOff } from '@renderer/lib/pdf-canvas/sceneHit'
import {
  clientToSceneCoords,
  findPdfHighlightAt,
  formattedSelectionToHighlightSkeletons,
  HIGHLIGHT_FILL,
  highlightGroupId,
  isPdfHighlight,
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
import { stripElbowArrows } from '@renderer/lib/pdf-canvas/stripElbowArrows'
import { shouldSuppressUnlockPopup } from '@renderer/lib/pdf-canvas/suppressUnlockPopup'
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
import { SearchBrowseHint } from './SearchBrowseHint'
import { SearchCaptureEmbed } from './SearchCaptureEmbed'
import { liveExcalidrawApi, setSelectionToolLocked } from './selectionTool'
import { usePdfFindBar } from './usePdfFindBar'
import { useSearchCaptureBrowser } from './useSearchCaptureBrowser'

import '@excalidraw/excalidraw/index.css'
import '@renderer/excalidraw.css'

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
  /** Last live scene for leave-flush after @next destroys get* / nulls onExcalidrawAPI. */
  const sceneCacheRef = useRef<unknown[] | null>(null)
  const cameraRef = useRef<CameraState>(INITIAL_CAMERA)
  const pdfLayerRef = useRef<PdfLayerHandle>(null)
  const pageNavigatorRef = useRef<PageNavigatorHandle>(null)
  const pdfSidebarRef = useRef<PdfSidebarHandle>(null)
  const highlightToolbarRef = useRef<HTMLDivElement>(null)
  const searchBrowseHintRef = useRef<HTMLDivElement>(null)
  const activeHighlightIdRef = useRef<string | null>(null)
  /** Selected promoted search-capture image (hint chip); null when hidden. */
  const activeSearchImageIdRef = useRef<string | null>(null)
  /** Text selection awaiting a color click — not yet in the scene. */
  const pendingHighlightRef = useRef<ExcalidrawElementSkeleton[] | null>(null)
  const placeNoteModeRef = useRef(false)
  const placeBrowserModeRef = useRef(false)
  /** Keep PE pass-through until pointerup so mid-drag over a shape doesn't steal text select. */
  const textSelectGestureRef = useRef(false)
  /** Primary-button (or any) pointer down — cheap onChange path while dragging embeds. */
  const pointerButtonsDownRef = useRef(false)
  /** Coalesce host arrow updateScene to one per animation frame. */
  const arrowSyncRafRef = useRef<number | null>(null)
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
  /** Clears UnlockPopup for host-locked PDF artifacts (highlights / note+search arrows). */
  const unlockSuppressUnsubRef = useRef<(() => void) | null>(null)

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
    browserChromeRef,
    zoomPercentRef,
    zoomIn,
    zoomOut,
    resizeActiveBrowser,
    isBrowsing,
    syncActiveBrowserBounds,
    suppressActiveEmbedWhileBrowsing,
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

  /** Promoted image under pointer (reading mode) — drives browse chip without selection. */
  const hoveredSearchImageIdRef = useRef<string | null>(null)

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

  /** Show chip for hovered or single-selected promoted search image (not browsing). */
  const syncSearchBrowseHint = useCallback(() => {
    if (isBrowsing()) {
      hideSearchBrowseHint()
      return
    }
    const api = apiRef.current
    if (!api) {
      hideSearchBrowseHint()
      return
    }

    const pickImageId = (id: string | null | undefined): string | null => {
      if (!id) return null
      const el = api.getSceneElements().find((e) => e.id === id)
      if (!el || el.isDeleted || !isPdfSearchCapture(el) || el.type !== 'image') return null
      return el.id
    }

    const selected = api.getAppState().selectedElementIds ?? {}
    const selectedIds = Object.keys(selected).filter((id) => selected[id])
    const id =
      pickImageId(hoveredSearchImageIdRef.current) ??
      (selectedIds.length === 1 ? pickImageId(selectedIds[0]) : null)

    if (!id) {
      hideSearchBrowseHint()
      return
    }
    activeSearchImageIdRef.current = id
    positionSearchBrowseHint()
  }, [hideSearchBrowseHint, isBrowsing, positionSearchBrowseHint])

  const syncSearchBrowseHintRef = useRef(syncSearchBrowseHint)
  syncSearchBrowseHintRef.current = syncSearchBrowseHint

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
      // EmbedActivateHint lives under Excalidraw scale(zoom); counter-scale via CSS var.
      containerRef.current?.style.setProperty('--canvas-zoom', String(next.zoom))

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
      if (activeSearchImageIdRef.current) {
        positionSearchBrowseHint()
      }
      if (isBrowsing()) {
        syncActiveBrowserBounds()
      }
    },
    [positionHighlightToolbar, positionSearchBrowseHint, isBrowsing, syncActiveBrowserBounds]
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

  const armAutosaveTimer = useCallback(() => {
    clearSaveTimer()
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null
      void writeSnapshotNow()
    }, AUTOSAVE_DEBOUNCE_MS)
  }, [clearSaveTimer, writeSnapshotNow])

  const markUnsaved = useCallback(() => {
    if (!readyRef.current || restoringRef.current) return

    // During drag with session already dirty: skip full-scene JSON stringify.
    if (pointerButtonsDownRef.current && dirtyRef.current) {
      armAutosaveTimer()
      return
    }

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
    armAutosaveTimer()
  }, [armAutosaveTimer, clearSaveTimer, currentPersistSignature, syncSaveChip])

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
    if (!documentManager) return

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

        // Copy into a fresh ArrayBuffer — engine may transfer the buffer to the worker.
        const ab = bytes.buffer.slice(
          bytes.byteOffset,
          bytes.byteOffset + bytes.byteLength
        ) as ArrayBuffer

        const docs = documentManagerRef.current
        if (!docs) {
          setLoadError('PDF document manager not ready')
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
                    ).map((el) => normalizePdfSearchCapture(normalizePdfNote(el)))
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
    documentManager,
    engine,
    pdfId,
    pushCamera,
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

  const flushHostArrowSync = useCallback((): boolean => {
    arrowSyncRafRef.current = null
    const api = liveExcalidrawApi(apiRef.current)
    if (!api || restoringRef.current) return false
    if (api.getAppState().newElement != null || api.getAppState().multiElement != null) return false

    let scene = api.getSceneElementsIncludingDeleted()
    let changed = false
    const syncedNotes = syncPdfNoteArrows(scene, { migrateBoundArrows: false })
    if (syncedNotes.changed) {
      scene = syncedNotes.elements
      changed = true
    }
    const syncedCaptures = syncPdfSearchArrows(scene)
    if (syncedCaptures.changed) {
      scene = syncedCaptures.elements
      changed = true
    }
    if (!changed) return false
    api.updateScene({
      elements: scene,
      captureUpdate: CaptureUpdateAction.NEVER
    })
    return true
  }, [])

  const scheduleHostArrowSync = useCallback(() => {
    if (arrowSyncRafRef.current != null) return
    arrowSyncRafRef.current = requestAnimationFrame(() => {
      flushHostArrowSync()
    })
  }, [flushHostArrowSync])

  /** Relock / repair / annotation list — skipped during drag, run once on pointerup. */
  const runHostSceneMaintenance = useCallback(() => {
    const api = liveExcalidrawApi(apiRef.current)
    if (!api || restoringRef.current) return

    let scene = api.getSceneElementsIncludingDeleted()

    // Ban elbow arrows (Excalidraw ±1e6 render hard-limit). A-key still cycles to elbow.
    const stripped = stripElbowArrows(scene)
    if (stripped.changed) {
      scene = stripped.elements
      api.updateScene({
        elements: scene,
        captureUpdate: CaptureUpdateAction.NEVER
      })
    }
    if (api.getAppState().currentItemArrowType === 'elbow') {
      api.updateScene({
        appState: { currentItemArrowType: 'sharp' },
        captureUpdate: CaptureUpdateAction.NEVER
      })
    }

    if (scene.some((el) => !el.isDeleted && isPdfHighlight(el) && !el.locked)) {
      scene = scene.map((el) =>
        !el.isDeleted && isPdfHighlight(el) && !el.locked
          ? (newElementWith(el, {
              locked: true
            } as Parameters<typeof newElementWith>[1]) as typeof el)
          : el
      )
      api.updateScene({
        elements: scene,
        captureUpdate: CaptureUpdateAction.NEVER
      })
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

    if (scene.some((el) => !el.isDeleted && el.link && isPdfNote(el))) {
      queueStripPdfNoteLinks()
    }

    const active = api.getAppState().activeEmbeddable
    const editingNote =
      active?.state === 'active' && active.element != null && isPdfNote(active.element)

    if (editingNote && isBrowsing()) {
      void deactivateSearchBrowser()
    }

    if (isBrowsing()) {
      syncActiveBrowserBounds()
      hideSearchBrowseHint()
    } else {
      syncSearchBrowseHint()
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
  }, [
    deactivateSearchBrowser,
    hideSearchBrowseHint,
    isBrowsing,
    queueStripPdfNoteLinks,
    syncActiveBrowserBounds,
    syncAnnotations,
    syncSearchBrowseHint
  ])

  const endPointerGesture = useCallback(() => {
    const wasDown = pointerButtonsDownRef.current
    pointerButtonsDownRef.current = false
    if (!wasDown) return
    if (arrowSyncRafRef.current != null) {
      cancelAnimationFrame(arrowSyncRafRef.current)
      arrowSyncRafRef.current = null
    }
    flushHostArrowSync()
    runHostSceneMaintenance()
    markUnsaved()
  }, [flushHostArrowSync, markUnsaved, runHostSceneMaintenance])

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

          // Selection-driven browse chip — must run before hover early-return
          // (pointermove over note/search center emits hover and would otherwise leave a ghost chip).
          syncSearchBrowseHint()

          // Browse owns the guest via activeBrowserCaptureIdRef — keep Excalidraw
          // from flipping the capture into activeEmbeddable (blocks ring drag).
          suppressActiveEmbedWhileBrowsing()

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
          // IncludingDeleted so soft-deleted arrows revive after Ctrl+Z.
          scheduleHostArrowSync()

          // Excalidraw setStates activeEmbeddable "hover" on every pointermove over the
          // note center third (no equality guard) → onChange spam. Skip the rest
          // (including markUnsaved — pure hover must not stringify the scene).
          if (appState.activeEmbeddable?.state === 'hover') {
            return
          }

          // Drag hot path: arrows scheduled; skip O(n) scans + full persist until pointerup.
          if (pointerButtonsDownRef.current) {
            if (isBrowsing()) syncActiveBrowserBounds()
            if (activeSearchImageIdRef.current) positionSearchBrowseHint()
            markUnsaved()
            return
          }

          runHostSceneMaintenance()
        }
      }
      markUnsaved()
    },
    [
      hideHighlightToolbar,
      isBrowsing,
      markUnsaved,
      positionSearchBrowseHint,
      runHostSceneMaintenance,
      scheduleHostArrowSync,
      suppressActiveEmbedWhileBrowsing,
      syncActiveBrowserBounds,
      syncSearchBrowseHint
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

      const linkTarget = pdfLayerRef.current?.findLinkAt(sceneX, sceneY)
      if (linkTarget != null) {
        goToPage(linkTarget)
        hideHighlightToolbar()
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
      goToPage,
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

      // Drop pending before clearEmbedSelection so onSelectionChange(null) does not
      // race-hide and wipe the skeletons we are about to commit.
      pendingHighlightRef.current = null
      setHighlightToolbarPending(false)
      clearEmbedSelection()

      const colored = withHighlightSkeletonColor(pending, color)
      const newElements = convertToExcalidrawElements(colored)
      api.updateScene({
        elements: [...api.getSceneElements(), ...newElements],
        captureUpdate: CaptureUpdateAction.IMMEDIATELY
      })

      const first = newElements[0]
      if (!first) return null

      activeHighlightIdRef.current = first.id
      setActiveHighlightColor(color)
      markUnsaved()
      focusCanvasRoot()
      return first.id
    },
    [clearEmbedSelection, focusCanvasRoot, markUnsaved]
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
        clearEmbedSelection()
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
  }, [clearEmbedSelection, hideHighlightToolbar])

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
        // NoteEmbed onKeyDown only runs if focus is inside the note. After Place
        // note / toolbar clicks, contenteditable can be mounted but unfocused —
        // still exit edit (do not touch browse: guest owns Escape via IPC).
        if (apiRef.current?.getAppState().activeEmbeddable?.state === 'active' && !isBrowsing()) {
          clearActiveEmbeddable()
          event.preventDefault()
          return
        }
        if (activeHighlightIdRef.current || pendingHighlightRef.current) {
          hideHighlightToolbar()
          clearEmbedSelection()
          event.preventDefault()
        }
        return
      }

      // Cmd/Ctrl+A: clear PDF text selection; do not Excalidraw select-all.
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
        event.stopPropagation()
        clearEmbedSelection()
        return
      }

      // Excalidraw hardcodes Ctrl/Cmd+Delete|Backspace → clear-canvas confirm,
      // ignoring UIOptions.canvasActions.clearCanvas: false. Block it in host.
      // Do not bail on activeEmbeddable alone: note can be active with focus
      // outside contenteditable (chrome / portaled UI) and still open the wipe dialog.
      if (
        (event.metaKey || event.ctrlKey) &&
        (event.key === 'Backspace' || event.key === 'Delete') &&
        !event.altKey
      ) {
        if (isWritableKeyTarget(event.target)) return
        if (apiRef.current?.getAppState().editingTextElement) return
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [clearActiveEmbeddable, clearEmbedSelection, exitPlaceModes, hideHighlightToolbar, isBrowsing])

  // EmbedPDF selection → pending highlight toolbar; clear → hide pending.
  useEffect(() => {
    if (!selectionCapability || !session) return
    const documentId = session.documentId
    const scope = selectionCapability.forDocument(documentId)
    const layout = session.layout

    const unsubEnd = scope.onEndSelection(() => {
      void (async () => {
        const formatted = scope.getFormattedSelection()
        if (formatted.length === 0) return
        let text = ''
        try {
          const lines = await scope.getSelectedText().toPromise()
          text = lines.join('\n')
        } catch (err) {
          console.error('Failed to get selected PDF text', err)
        }
        // Open-race / leave: ignore stale async after document switch.
        if (sessionRef.current?.documentId !== documentId) return
        const skeletons = formattedSelectionToHighlightSkeletons(formatted, text, layout)
        if (!skeletons) return
        showPendingHighlightToolbar(skeletons)
        focusCanvasRoot()
      })()
    })

    const unsubChange = scope.onSelectionChange((sel) => {
      if (sel != null) return
      if (!pendingHighlightRef.current) return
      hideHighlightToolbar()
    })

    return () => {
      unsubEnd()
      unsubChange()
    }
  }, [
    focusCanvasRoot,
    hideHighlightToolbar,
    selectionCapability,
    session,
    showPendingHighlightToolbar
  ])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const onMouseUp = () => {
      textSelectGestureRef.current = false
    }

    el.addEventListener('mouseup', onMouseUp)
    return () => el.removeEventListener('mouseup', onMouseUp)
  }, [])

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

    const onWheel = (event: WheelEvent) => {
      // Sidebar / Excalidraw chrome overlay the page AABB — don't steal their scroll.
      if (isExcalidrawUiPointerTarget(event.target)) return

      const overPage =
        pdfTextPassRef.current ||
        (event.target instanceof Element && event.target.closest('[data-pdf-page]') != null)
      if (!overPage) return

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

  // Hit-test gate: selection tool + over PDF page box + no nearby scene
  // element → pass through. Use geometric `[data-pdf-page]` bounds (not event.target):
  // while Excalidraw is on top, target is the canvas, so closest('[data-pdf-page]')
  // would never arm pass. Gutters keep marquee. Pad + pointerdown forward fix
  // the PE-toggle race (browser sticks the event target for that frame).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let forwardingPointer = false

    const isOverPdfPageBox = (clientX: number, clientY: number): boolean => {
      for (const pageEl of el.querySelectorAll('[data-pdf-page]')) {
        const r = pageEl.getBoundingClientRect()
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
      // Empty gutters (not over a page): Excalidraw keeps marquee.
      if (!isOverPdfPageBox(clientX, clientY)) {
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

      if (event.buttons !== 0) pointerButtonsDownRef.current = true

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
          if (wasPending) clearEmbedSelection()
        }
      }

      // Race: pass was on → pointer targeted PDF page, but this point is
      // inside a real (unpadded) scene element. Pad alone must not steal text
      // clicks in the halo — only forward on a true AABB hit.
      // PDF internal link overlays win over scene elements underneath (same
      // priority as handlePointerDown findLinkAt → goToPage).
      if (
        wasPass &&
        target instanceof Element &&
        target.closest('[data-pdf-page]') &&
        !target.closest('[data-pdf-link]')
      ) {
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
      endPointerGesture()
    }

    const onPointerCancel = () => {
      textSelectGestureRef.current = false
      endPointerGesture()
    }

    const onBlur = () => {
      textSelectGestureRef.current = false
      setPdfTextPass(false)
      endPointerGesture()
    }

    // OS file drag: pointermove freezes, so pass can stay on over PDF text and
    // Excalidraw's onDrop never fires (host PE-none). Clear pass on dragover so
    // the next hit-test reaches Excalidraw. If drop still lands on a PDF page
    // (same-tick PE), re-dispatch to .excalidraw with the live dataTransfer.
    // Chrome image drag: html/uri-list only (no Files) — clear pass + fetch in
    // main (renderer CSP), then re-dispatch a File drop for insertImages.
    const dataTransferHasFiles = (dt: DataTransfer | null): boolean =>
      !!dt && Array.from(dt.types ?? []).includes('Files')

    let forwardingDrop = false

    const dispatchFileDropToExcalidraw = (
      file: File,
      clientX: number,
      clientY: number,
      screenX: number,
      screenY: number
    ) => {
      const excal = el.querySelector('.excalidraw')
      if (!(excal instanceof HTMLElement)) return
      const dt = new DataTransfer()
      dt.items.add(file)
      if (dt.files.length !== 1) return
      forwardingDrop = true
      try {
        excal.dispatchEvent(
          new DragEvent('drop', {
            bubbles: true,
            cancelable: true,
            clientX,
            clientY,
            screenX,
            screenY,
            dataTransfer: dt
          })
        )
      } finally {
        forwardingDrop = false
      }
    }

    const onDragOver = (event: DragEvent) => {
      if (dataTransferHasFiles(event.dataTransfer)) {
        setPdfTextPass(false)
        return
      }
      if (dataTransferLooksLikeBrowserUrlOrImageDrag(event.dataTransfer)) {
        event.preventDefault()
        setPdfTextPass(false)
      }
    }

    const placeDroppedUrlCapture = (url: string, clientX: number, clientY: number) => {
      const api = apiRef.current
      if (!api) return
      const appState = api.getAppState()
      if (appState.activeEmbeddable?.state === 'active') return
      if (appState.editingTextElement) return

      const { x, y } = clientToSceneCoords(clientX, clientY, appState)
      const capture = createSearchCapture({
        x: x - SEARCH_CAPTURE_WIDTH / 2,
        y: y - SEARCH_CAPTURE_HEIGHT / 2,
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

    const onDropCapture = (event: DragEvent) => {
      if (forwardingDrop) return

      if (dataTransferHasFiles(event.dataTransfer)) {
        setPdfTextPass(false)
        const target = event.target
        if (!(target instanceof Element) || !target.closest('[data-pdf-page]')) return
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
        return
      }

      const imageUrl = imageUrlFromDataTransfer(event.dataTransfer)
      // Always cancel html/uri-list drops: dragover already preventDefault'd so
      // Chromium treats us as a drop target; without this, a non-image URL drop
      // can navigate webContents and wipe the unsaved canvas.
      if (dataTransferLooksLikeBrowserImageDrag(event.dataTransfer)) {
        event.preventDefault()
        event.stopPropagation()
        setPdfTextPass(false)
        if (imageUrl) {
          const { clientX, clientY, screenX, screenY } = event
          void (async () => {
            const fetched = await fetchImageUrl(imageUrl)
            if (!fetched) {
              console.warn('browser image drop: fetch failed', imageUrl)
              return
            }
            const ext = mimeToExt(fetched.mimeType)
            const bytes = new Uint8Array(fetched.bytes)
            const file = new File([bytes], `drop.${ext}`, { type: fetched.mimeType })
            dispatchFileDropToExcalidraw(file, clientX, clientY, screenX, screenY)
          })()
          return
        }

        // Non-image URL → search capture (image path already preferred above).
        const url = droppedHttpUrlForSearchCapture(event.dataTransfer)
        if (url) placeDroppedUrlCapture(url, event.clientX, event.clientY)
        return
      }

      // text/plain-only URL drag (no html/uri-list types).
      const plainUrl = droppedHttpUrlForSearchCapture(event.dataTransfer)
      if (!plainUrl) return
      event.preventDefault()
      event.stopPropagation()
      setPdfTextPass(false)
      placeDroppedUrlCapture(plainUrl, event.clientX, event.clientY)
    }

    el.addEventListener('pointermove', onPointerMove, true)
    el.addEventListener('pointerdown', onPointerDown, true)
    el.addEventListener('dragover', onDragOver, true)
    el.addEventListener('drop', onDropCapture, true)
    window.addEventListener('pointerup', onPointerUp)
    window.addEventListener('pointercancel', onPointerCancel)
    window.addEventListener('blur', onBlur)
    return () => {
      el.removeEventListener('pointermove', onPointerMove, true)
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('dragover', onDragOver, true)
      el.removeEventListener('drop', onDropCapture, true)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', onBlur)
    }
  }, [
    clearEmbedSelection,
    endPointerGesture,
    hideHighlightToolbar,
    isBrowsing,
    markUnsaved,
    openSearchBrowser,
    queueStripPdfNoteLinks,
    setPdfTextPass
  ])

  // Excalidraw setStates activeEmbeddable "hover" on every pointermove over an
  // embed (no equality guard) → full App re-render / remount. Stop those moves
  // from reaching the canvas for the full card AABB; pointerdown/up still
  // activate click-to-edit and edge-drag. Also drives EmbedActivateHint.
  useEffect(() => {
    const host = excalidrawHostRef.current
    if (!host) return

    let hoveredEmbedId: string | null = null

    const hintRoot = () => containerRef.current ?? host

    const clearActivateHintHover = () => {
      if (!hoveredEmbedId) return
      const prev = hintRoot().querySelector(
        `[data-pdf-note-id="${hoveredEmbedId}"], [data-pdf-search-capture-id="${hoveredEmbedId}"]`
      )
      prev?.removeAttribute('data-activate-hint-hover')
      hoveredEmbedId = null
    }

    const setActivateHintHover = (id: string | null) => {
      if (id !== hoveredEmbedId) {
        clearActivateHintHover()
      }
      if (!id) return
      const el = hintRoot().querySelector(
        `[data-pdf-note-id="${id}"], [data-pdf-search-capture-id="${id}"]`
      )
      if (!el) return
      // Re-apply every move — Excalidraw hover remount can drop the attribute.
      el.setAttribute('data-activate-hint-hover', '')
      hoveredEmbedId = id
    }

    const onPointerMoveCapture = (event: PointerEvent) => {
      if (event.buttons !== 0) {
        clearActivateHintHover()
        hoveredSearchImageIdRef.current = null
        syncSearchBrowseHintRef.current()
        return
      }
      if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return
      // Style panel / toolbars sit over the scene — don't steal their hover.
      if (isExcalidrawUiPointerTarget(event.target)) {
        clearActivateHintHover()
        hoveredSearchImageIdRef.current = null
        syncSearchBrowseHintRef.current()
        return
      }
      const api = apiRef.current
      if (!api) return
      const appState = api.getAppState()
      if (appState.activeEmbeddable?.state === 'active') {
        clearActivateHintHover()
        hoveredSearchImageIdRef.current = null
        syncSearchBrowseHintRef.current()
        return
      }
      const { x, y } = clientToSceneCoords(event.clientX, event.clientY, appState)
      const elements = api.getSceneElements()
      const note = findPdfNoteAt(elements, x, y)
      const capture = findPdfSearchCaptureAt(elements, x, y)
      const embedCapture =
        capture && !capture.locked && capture.type === 'embeddable' ? capture : null
      const imageCapture = capture && !capture.locked && capture.type === 'image' ? capture : null

      // Full-card stopPropagation (not just center): Excalidraw's embed "hover"
      // remounts renderEmbeddable and would wipe data-activate-hint-hover.
      // pointerdown/up still reach the canvas so edge-drag / center-activate work.
      if (note && !note.locked) {
        hoveredSearchImageIdRef.current = null
        setActivateHintHover(note.id)
        syncSearchBrowseHintRef.current()
        event.stopPropagation()
        return
      }
      if (embedCapture) {
        hoveredSearchImageIdRef.current = null
        setActivateHintHover(embedCapture.id)
        syncSearchBrowseHintRef.current()
        event.stopPropagation()
        return
      }
      // Reading-mode PNG: no embed DOM — host chip on hover (do not stopPropagation).
      if (imageCapture) {
        setActivateHintHover(null)
        hoveredSearchImageIdRef.current = imageCapture.id
        syncSearchBrowseHintRef.current()
        return
      }
      hoveredSearchImageIdRef.current = null
      setActivateHintHover(null)
      syncSearchBrowseHintRef.current()
    }

    const onPointerLeave = () => {
      clearActivateHintHover()
      hoveredSearchImageIdRef.current = null
      syncSearchBrowseHintRef.current()
    }

    host.addEventListener('pointermove', onPointerMoveCapture, true)
    host.addEventListener('pointerleave', onPointerLeave)
    return () => {
      host.removeEventListener('pointermove', onPointerMoveCapture, true)
      host.removeEventListener('pointerleave', onPointerLeave)
      clearActivateHintHover()
    }
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
          doc={session.doc}
          documentId={session.documentId}
          onInternalLink={goToPage}
        />
      ) : null}

      <div ref={excalidrawHostRef} className="excalidraw-host absolute inset-0 z-10">
        <Excalidraw
          onExcalidrawAPI={(api) => {
            apiRef.current = api
          }}
          onInitialize={(api) => {
            unlockSuppressUnsubRef.current?.()
            unlockSuppressUnsubRef.current = api.onStateChange('activeLockedId', (id) => {
              if (!shouldSuppressUnlockPopup(id, api.getSceneElements())) return
              api.updateScene({
                appState: { activeLockedId: null },
                captureUpdate: CaptureUpdateAction.NEVER
              })
            })
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
      <SearchBrowseHint ref={searchBrowseHintRef} />

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
