import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform'
import type { ExcalidrawImperativeAPI, NormalizedZoomValue } from '@excalidraw/excalidraw/types'
import { useSelectionCapability } from '@embedpdf/plugin-selection/react'
import { fetchImageUrl } from '@renderer/integrations/ipc'
import {
  dataTransferLooksLikeBrowserImageDrag,
  dataTransferLooksLikeBrowserUrlOrImageDrag,
  imageUrlFromDataTransfer
} from '@renderer/lib/pdf-canvas/browserImageDrop'
import { isExcalidrawUiPointerTarget } from '@renderer/lib/pdf-canvas/excalidrawUiTarget'
import { mimeToExt } from '@renderer/lib/pdf-canvas/attachments'
import type { PageLayout } from '@renderer/lib/pdf-canvas/PageLayout'
import {
  createWysiwygNote,
  findPdfNoteAt,
  NOTE_HEIGHT,
  NOTE_WIDTH
} from '@renderer/lib/pdf-canvas/pdfNotes'
import {
  createSearchCapture,
  droppedHttpUrlForSearchCapture,
  findPdfSearchCaptureAt,
  isPdfSearchCapture,
  pastedHttpUrlForSearchCapture,
  SEARCH_CAPTURE_HEIGHT,
  SEARCH_CAPTURE_WIDTH
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import type { PdfLinkHit } from '@renderer/lib/pdf-canvas/pdfLinks'
import { PASS_HIT_PAD_PX } from '@renderer/lib/pdf-canvas/pdfTextPassHitPad'
import { findSceneElementAt, holdsPdfTextPassOff } from '@renderer/lib/pdf-canvas/sceneHit'
import {
  clientToSceneCoords,
  findPdfHighlightAt,
  formattedSelectionToHighlightSkeletons
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import { useCallback, useEffect, useRef, type RefObject } from 'react'
import { liveExcalidrawApi, setSelectionToolLocked } from './selectionTool'

type UsePdfTextPassArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  sessionRef: RefObject<{ documentId: string } | null>
  pdfLayerRef: RefObject<{ findLinkAt(x: number, y: number): PdfLinkHit | null } | null>
  containerRef: RefObject<HTMLDivElement | null>
  excalidrawHostRef: RefObject<HTMLDivElement | null>
  pointerButtonsDownRef: RefObject<boolean>
  textSelectGestureRef: RefObject<boolean>
  pdfTextPassRef: RefObject<boolean>
  activeHighlightIdRef: RefObject<string | null>
  pendingHighlightRef: RefObject<ExcalidrawElementSkeleton[] | null>
  hoveredSearchImageIdRef: RefObject<string | null>
  placeNoteModeRef: RefObject<boolean>
  placeBrowserModeRef: RefObject<boolean>
  syncSearchBrowseHint: () => void
  selectionCapability: ReturnType<typeof useSelectionCapability>['provides']
  session: { documentId: string; layout: PageLayout } | null
  setPdfTextPass: (on: boolean) => void
  clearActiveEmbeddable: () => void
  focusCanvasRoot: () => void
  hideHighlightToolbar: () => void
  showHighlightToolbar: (highlightId: string) => void
  showPendingHighlightToolbar: (skeletons: ExcalidrawElementSkeleton[]) => void
  clearEmbedSelection: () => void
  markUnsaved: () => void
  queueStripPdfNoteLinks: () => void
  openSearchBrowser: (el: {
    id: string
    x: number
    y: number
    width: number
    height: number
    customData?: ExcalidrawElement['customData']
  }) => void
  goToAnnotation: (id: string) => void
  goToPage: (pageIndex0: number) => void
  onHttpLink: (url: string) => void
  exitPlaceModes: () => void
  endPointerGesture: () => void
}

/**
 * PDF text pass-through + pointer / keyboard / wheel / paste / drop input gating.
 * Host-owned because Excalidraw owns the camera: `.pdf-text-pass` (PE-none) lets
 * selection hit the EmbedPDF SelectionLayer, and every event handler here decides
 * who owns the pointer (canvas vs PDF page vs embed).
 */
export function usePdfTextPass({
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
  onHttpLink,
  exitPlaceModes,
  endPointerGesture
}: UsePdfTextPassArgs) {
  const syncSearchBrowseHintRef = useRef(syncSearchBrowseHint)
  syncSearchBrowseHintRef.current = syncSearchBrowseHint

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

      const link = pdfLayerRef.current?.findLinkAt(sceneX, sceneY)
      if (link) {
        if (link.kind === 'http') onHttpLink(link.url)
        else goToPage(link.targetPageIndex)
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
      apiRef,
      exitPlaceModes,
      goToAnnotation,
      goToPage,
      onHttpLink,
      hideHighlightToolbar,
      markUnsaved,
      openSearchBrowser,
      pdfLayerRef,
      placeBrowserModeRef,
      placeNoteModeRef,
      queueStripPdfNoteLinks,
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
        if (apiRef.current?.getAppState().activeEmbeddable?.state === 'active') {
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
  }, [
    activeHighlightIdRef,
    apiRef,
    clearActiveEmbeddable,
    clearEmbedSelection,
    exitPlaceModes,
    hideHighlightToolbar,
    pendingHighlightRef,
    placeBrowserModeRef,
    placeNoteModeRef
  ])

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
    pendingHighlightRef,
    selectionCapability,
    session,
    sessionRef,
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
  }, [containerRef, textSelectGestureRef])

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
  }, [apiRef, containerRef, markUnsaved, openSearchBrowser, queueStripPdfNoteLinks])

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
  }, [apiRef, containerRef, isExcalidrawUiPointerTarget, pdfTextPassRef])

  // Hit-test gate: selection tool + over PDF page box + no nearby scene
  // element → pass through. Use geometric `[data-pdf-page]` bounds (not event.target):
  // while Excalidraw is on top, target is the canvas, so closest('[data-pdf-page]')
  // would never arm pass. Gutters keep marquee. Pad + pointerdown forward fix
  // the PE-toggle race (browser sticks the event target for that frame).
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    let forwardingPointer = false
    // Coalesce pointermove hit-tests to one per animation frame.
    let passRafId: number | null = null
    let pendingPassPoint: { clientX: number; clientY: number; target: EventTarget | null } | null =
      null

    const flushPassThrough = () => {
      passRafId = null
      const p = pendingPassPoint
      pendingPassPoint = null
      if (p) updatePassThrough(p.clientX, p.clientY, p.target)
    }

    const cancelPendingPass = () => {
      if (passRafId != null) {
        cancelAnimationFrame(passRafId)
        passRafId = null
      }
      pendingPassPoint = null
    }

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
      // Latest point wins; one updatePassThrough per frame (layout reads capped).
      pendingPassPoint = { clientX: event.clientX, clientY: event.clientY, target: event.target }
      if (passRafId == null) {
        passRafId = requestAnimationFrame(flushPassThrough)
      }
    }

    const onPointerDown = (event: PointerEvent) => {
      // Synthetic re-dispatch from the race fix below — don't re-enter.
      if (forwardingPointer) return

      // Stale move flush must not run after this down — recompute from the down point.
      cancelPendingPass()

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
      // PDF link overlays win over scene elements underneath (same
      // priority as handlePointerDown findLinkAt).
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
      cancelPendingPass()
      textSelectGestureRef.current = false
      updatePassThrough(event.clientX, event.clientY, event.target)
      endPointerGesture()
    }

    const onPointerCancel = () => {
      cancelPendingPass()
      textSelectGestureRef.current = false
      endPointerGesture()
    }

    const onBlur = () => {
      cancelPendingPass()
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
      cancelPendingPass()
      el.removeEventListener('pointermove', onPointerMove, true)
      el.removeEventListener('pointerdown', onPointerDown, true)
      el.removeEventListener('dragover', onDragOver, true)
      el.removeEventListener('drop', onDropCapture, true)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerCancel)
      window.removeEventListener('blur', onBlur)
    }
  }, [
    activeHighlightIdRef,
    apiRef,
    clearEmbedSelection,
    containerRef,
    endPointerGesture,
    hideHighlightToolbar,
    markUnsaved,
    openSearchBrowser,
    pdfTextPassRef,
    pendingHighlightRef,
    placeBrowserModeRef,
    placeNoteModeRef,
    pointerButtonsDownRef,
    queueStripPdfNoteLinks,
    setPdfTextPass,
    textSelectGestureRef
  ])

  // Excalidraw setStates activeEmbeddable "hover" on every pointermove over an
  // embed (no equality guard) → full App re-render / remount. Stop those moves
  // from reaching the canvas for the full card AABB; pointerdown/up still
  // activate click-to-edit and edge-drag. Also drives EmbedActivateHint.
  useEffect(() => {
    const host = excalidrawHostRef.current
    if (!host) return

    let hoveredEmbedId: string | null = null
    /** Same viewport point → same hit result; skip scene scans + DOM writes. */
    let lastHintPointKey = ''

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
        lastHintPointKey = ''
        clearActivateHintHover()
        hoveredSearchImageIdRef.current = null
        syncSearchBrowseHintRef.current()
        return
      }
      if (event.altKey || event.shiftKey || event.metaKey || event.ctrlKey) return
      // Style panel / toolbars sit over the scene — don't steal their hover.
      if (isExcalidrawUiPointerTarget(event.target)) {
        lastHintPointKey = ''
        clearActivateHintHover()
        hoveredSearchImageIdRef.current = null
        syncSearchBrowseHintRef.current()
        return
      }
      const pointKey = `${event.clientX},${event.clientY}`
      if (pointKey === lastHintPointKey) return
      lastHintPointKey = pointKey
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
      lastHintPointKey = ''
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
  }, [apiRef, containerRef, excalidrawHostRef, hoveredSearchImageIdRef])

  return { handlePointerDown }
}
