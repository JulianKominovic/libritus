import { CaptureUpdateAction, newElementWith } from '@excalidraw/excalidraw'
import type { ExcalidrawElement } from '@excalidraw/excalidraw/element/types'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { isPdfHighlight } from '@renderer/lib/pdf-canvas/selectionToHighlights'
import {
  isPdfNote,
  repairUnvalidatedPdfNotes,
  syncPdfNoteColor,
  syncPdfNoteArrows,
  withNotePlateValue
} from '@renderer/lib/pdf-canvas/pdfNotes'
import { syncPdfSearchArrows } from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { stripElbowArrows } from '@renderer/lib/pdf-canvas/stripElbowArrows'
import type { Value } from 'platejs'
import { useCallback, useRef, type RefObject } from 'react'
import { liveExcalidrawApi } from './selectionTool'

type UsePdfHostSceneArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  restoringRef: RefObject<boolean>
  pointerButtonsDownRef: RefObject<boolean>
  noteIdsRef: RefObject<Set<string>>
  pendingPlateByNoteIdRef: RefObject<Map<string, Value>>
  queueStripPdfNoteLinks: () => void
  syncAnnotations: (elements: readonly ExcalidrawElement[]) => void
  syncSearchBrowseHint: () => void
  markUnsaved: () => void
}

/**
 * Host scene maintenance that must run outside Excalidraw's own pipeline:
 * note/search arrow sync (rAF-coalesced), elbow-arrow ban, highlight relock,
 * note repair, pending Plate merge and pointerup reconciliation.
 */
export function usePdfHostScene({
  apiRef,
  restoringRef,
  pointerButtonsDownRef,
  noteIdsRef,
  pendingPlateByNoteIdRef,
  queueStripPdfNoteLinks,
  syncAnnotations,
  syncSearchBrowseHint,
  markUnsaved
}: UsePdfHostSceneArgs) {
  /** Coalesce host arrow updateScene to one per animation frame. */
  const arrowSyncRafRef = useRef<number | null>(null)

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
  }, [apiRef, restoringRef])

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

    const syncedColors = syncPdfNoteColor(scene)
    if (syncedColors.changed) {
      scene = syncedColors.elements
      api.updateScene({
        elements: scene,
        captureUpdate: CaptureUpdateAction.NEVER
      })
    }

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

    syncSearchBrowseHint()

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
    apiRef,
    noteIdsRef,
    pendingPlateByNoteIdRef,
    queueStripPdfNoteLinks,
    restoringRef,
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
  }, [flushHostArrowSync, markUnsaved, pointerButtonsDownRef, runHostSceneMaintenance])

  return {
    arrowSyncRafRef,
    flushHostArrowSync,
    scheduleHostArrowSync,
    runHostSceneMaintenance,
    endPointerGesture
  }
}
