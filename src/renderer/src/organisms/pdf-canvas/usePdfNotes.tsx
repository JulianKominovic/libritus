import type { ExcalidrawImperativeAPI } from '@excalidraw/excalidraw/types'
import { getNotePlateValue, isPdfNote } from '@renderer/lib/pdf-canvas/pdfNotes'
import {
  getSearchCaptureQuery,
  isPdfSearchCapture
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import type { Value } from 'platejs'
import { useCallback, useRef, useState, type RefObject } from 'react'
import { NoteEmbed } from './NoteEmbed'
import { SearchCaptureEmbed } from './SearchCaptureEmbed'
import { setSelectionToolLocked } from './selectionTool'

type UsePdfNotesArgs = {
  apiRef: RefObject<ExcalidrawImperativeAPI | null>
  pendingPlateByNoteIdRef: RefObject<Map<string, Value>>
  clearActiveEmbeddable: () => void
  hideHighlightToolbar: () => void
  setPdfTextPass: (on: boolean) => void
  markUnsaved: () => void
}

/**
 * WYSIWYG notes: place-note/browser modes, live Plate edits (ref-buffered, never
 * updateScene per keystroke) and the embeddable renderer.
 */
export function usePdfNotes({
  apiRef,
  pendingPlateByNoteIdRef,
  clearActiveEmbeddable,
  hideHighlightToolbar,
  setPdfTextPass,
  markUnsaved
}: UsePdfNotesArgs) {
  const placeNoteModeRef = useRef(false)
  const placeBrowserModeRef = useRef(false)
  const [placeNoteMode, setPlaceNoteMode] = useState(false)
  const [placeBrowserMode, setPlaceBrowserMode] = useState(false)

  const exitPlaceModes = useCallback(() => {
    placeNoteModeRef.current = false
    placeBrowserModeRef.current = false
    setPlaceNoteMode(false)
    setPlaceBrowserMode(false)
    setSelectionToolLocked(apiRef.current, false)
  }, [apiRef])

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
    [apiRef, clearActiveEmbeddable, hideHighlightToolbar, setPdfTextPass]
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
    [apiRef, markUnsaved, pendingPlateByNoteIdRef]
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
          backgroundColor={element.backgroundColor}
          editing={editing}
          onValueChange={updateNotePlateValue}
          onExitEdit={clearActiveEmbeddable}
        />
      )
    },
    [clearActiveEmbeddable, updateNotePlateValue]
  )

  return {
    placeNoteModeRef,
    placeBrowserModeRef,
    placeNoteMode,
    placeBrowserMode,
    exitPlaceModes,
    enterPlaceMode,
    togglePlaceNoteMode,
    togglePlaceBrowserMode,
    updateNotePlateValue,
    renderEmbeddable
  }
}
