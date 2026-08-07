import {
  CaptureUpdateAction,
  convertToExcalidrawElements,
  newElementWith,
  sceneCoordsToViewportCoords
} from '@excalidraw/excalidraw'
import type { ExcalidrawElementSkeleton } from '@excalidraw/excalidraw/element/transform'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import {
  highlightGroupId,
  setHighlightGroupColor,
  withHighlightSkeletonColor,
  HIGHLIGHT_FILL
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import { idsDeletedWithHighlight } from '@renderer/lib/pdf-canvas/pdfNotes'
import { useCallback, useRef, useState, type RefObject } from 'react'

type UsePdfHighlightsArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  containerRef: RefObject<HTMLDivElement | null>
  clearEmbedSelection: () => void
  focusCanvasRoot: () => void
  markUnsaved: () => void
}

/**
 * Highlight lifecycle: pending text-selection skeletons → toolbar → commit
 * (locked rects) → recolor / copy / remove. Geometry stays in refs + imperative
 * DOM (never React state driven from Excalidraw onChange).
 */
export function usePdfHighlights({
  apiRef,
  containerRef,
  clearEmbedSelection,
  focusCanvasRoot,
  markUnsaved
}: UsePdfHighlightsArgs) {
  const highlightToolbarRef = useRef<HTMLDivElement>(null)
  const activeHighlightIdRef = useRef<string | null>(null)
  /** Text selection awaiting a color click — not yet in the scene. */
  const pendingHighlightRef = useRef<ExcalidrawElementSkeleton[] | null>(null)
  const [activeHighlightColor, setActiveHighlightColor] = useState<string>(HIGHLIGHT_FILL)
  const [highlightToolbarPending, setHighlightToolbarPending] = useState(false)

  const hideHighlightToolbar = useCallback(() => {
    activeHighlightIdRef.current = null
    pendingHighlightRef.current = null
    setHighlightToolbarPending(false)
    const toolbar = highlightToolbarRef.current
    if (toolbar) toolbar.style.display = 'none'
  }, [])

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
  }, [apiRef, containerRef, hideHighlightToolbar])

  const showHighlightToolbar = useCallback(
    (highlightId: string) => {
      pendingHighlightRef.current = null
      setHighlightToolbarPending(false)
      activeHighlightIdRef.current = highlightId
      const el = apiRef.current?.getSceneElements().find((e) => e.id === highlightId)
      if (el) setActiveHighlightColor(el.backgroundColor || HIGHLIGHT_FILL)
      positionHighlightToolbar()
    },
    [apiRef, positionHighlightToolbar]
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
    [apiRef, clearEmbedSelection, focusCanvasRoot, markUnsaved]
  )

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
  }, [apiRef, clearEmbedSelection, hideHighlightToolbar])

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
      apiRef,
      commitPendingHighlight,
      focusCanvasRoot,
      hideHighlightToolbar,
      markUnsaved,
      showHighlightToolbar
    ]
  )

  return {
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
  }
}
