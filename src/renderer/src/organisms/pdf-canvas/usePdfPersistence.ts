import { CaptureUpdateAction } from '@excalidraw/excalidraw'
import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { syncCanvasStats, syncReadingProgress } from '@renderer/lib/pdf-canvas/catalogWriteback'
import {
  clearPdfNoteLinkForUi,
  normalizePdfNote,
  withNotePlateValue
} from '@renderer/lib/pdf-canvas/pdfNotes'
import { normalizePdfSearchCapture } from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import {
  SESSION_VERSION,
  writeSession,
  type SaveStatus,
  type SessionSnapshot
} from '@renderer/lib/pdf-canvas/session'
import { persistSignature, shouldMarkDirty } from '@renderer/lib/pdf-canvas/sessionPersist'
import { isSessionPersistFrozen } from '@renderer/lib/pdf-canvas/sessionPersistFreeze'
import type { CameraState } from '@renderer/lib/pdf-canvas/types'
import type { Value } from 'platejs'
import { useCallback, useRef, useState, type RefObject } from 'react'
import { liveExcalidrawApi } from './selectionTool'

const AUTOSAVE_DEBOUNCE_MS = 5_000

const SAVE_STATUS_LABEL: Record<SaveStatus, string> = {
  saved: 'Saved',
  unsaved: 'Unsaved',
  saving: 'Saving…',
  error: 'Error'
}

export { SAVE_STATUS_LABEL }

type UsePdfPersistenceArgs = {
  pdfId: string
  categoryId: string
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  sessionRef: RefObject<{ doc: { pageCount: number } } | null>
  cameraRef: RefObject<CameraState>
  currentPageRef: RefObject<number>
  readyRef: RefObject<boolean>
  restoringRef: RefObject<boolean>
  pointerButtonsDownRef: RefObject<boolean>
}

export function usePdfPersistence({
  pdfId,
  categoryId,
  apiRef,
  sessionRef,
  cameraRef,
  currentPageRef,
  readyRef,
  restoringRef,
  pointerButtonsDownRef
}: UsePdfPersistenceArgs) {
  const saveStatusRef = useRef<SaveStatus>('saved')
  const saveChipRef = useRef<HTMLSpanElement>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dirtyRef = useRef(false)
  const lastSavedSigRef = useRef('')
  const pendingSigRef = useRef('')
  /** Last live scene for leave-flush after @next destroys get* / nulls onExcalidrawAPI. */
  const sceneCacheRef = useRef<unknown[] | null>(null)
  /** Live Plate edits not yet written to the Excalidraw scene (avoid updateScene per keystroke). */
  const pendingPlateByNoteIdRef = useRef(new Map<string, Value>())

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved')

  const syncSaveChip = useCallback((next: SaveStatus) => {
    if (saveStatusRef.current === next) return
    saveStatusRef.current = next
    setSaveStatus(next)
    const chip = saveChipRef.current
    if (!chip) return
    chip.textContent = SAVE_STATUS_LABEL[next]
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
  }, [apiRef])

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
  }, [apiRef])

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
  }, [cameraRef, sceneElementsForPersist])

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
  }, [pdfId, readyRef, cameraRef, sceneElementsForPersist])

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
      syncCanvasStats(categoryId, pdfId, snapshot.elements as Parameters<typeof syncCanvasStats>[2])
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

  return {
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
    currentPersistSignature,
    buildSnapshot,
    writeSnapshotNow,
    armAutosaveTimer,
    markUnsaved,
    flushSave
  }
}
