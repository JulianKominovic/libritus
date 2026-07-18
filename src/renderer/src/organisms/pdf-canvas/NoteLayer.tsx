import { BaseEditorKit } from '@renderer/components/editor/editor-base-kit'
import { NoteEditorKit } from '@renderer/components/editor/note-editor-kit'
import { Editor, EditorContainer } from '@renderer/components/ui/editor'
import { EditorStatic } from '@renderer/components/ui/editor-static'
import { createSlateEditor, type Value } from 'platejs'
import { Plate, usePlateEditor } from 'platejs/react'
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react'

/** Identity + content only — geometry is applied imperatively (avoids Excalidraw onChange loops). */
export type NoteHudItem = {
  id: string
  plateValue: Value
}

export type NoteGeometry = {
  id: string
  left: number
  top: number
  width: number
  height: number
}

export type NoteEditCaret = {
  clientX: number
  clientY: number
}

export type NoteLayerHandle = {
  applyGeometry: (rects: readonly NoteGeometry[]) => void
}

type NoteLayerProps = {
  notes: NoteHudItem[]
  activeNoteId: string | null
  editCaret: NoteEditCaret | null
  onValueChange: (noteId: string, value: Value) => void
}

function NoteStaticBody({ value }: { value: Value }) {
  // usePlateEditor adds NavigationFeedbackPlugin (hooks in transformProps).
  // PlateStatic has no Plate store → crash. createSlateEditor = static-only core.
  const editor = useMemo(() => createSlateEditor({ plugins: BaseEditorKit, value }), [value])
  return (
    <EditorStatic editor={editor} variant="none" className="h-full overflow-hidden p-2 text-sm" />
  )
}

function domRangeAtPoint(clientX: number, clientY: number): Range | null {
  if (typeof document.caretRangeFromPoint === 'function') {
    return document.caretRangeFromPoint(clientX, clientY)
  }
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  const pos = doc.caretPositionFromPoint?.(clientX, clientY)
  if (!pos) return null
  const range = document.createRange()
  range.setStart(pos.offsetNode, pos.offset)
  range.collapse(true)
  return range
}

function NoteEditableBody({
  noteId,
  initialValue,
  caret,
  onValueChange
}: {
  noteId: string
  initialValue: Value
  caret: NoteEditCaret | null
  onValueChange: (noteId: string, value: Value) => void
}) {
  const editor = usePlateEditor({
    id: noteId,
    plugins: NoteEditorKit,
    value: initialValue
  })
  const skipNextChangeRef = useRef(true)
  const caretRef = useRef(caret)
  caretRef.current = caret

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []

    const placeCaretAndFocus = () => {
      if (cancelled) return
      const c = caretRef.current
      if (c) {
        const domRange = domRangeAtPoint(c.clientX, c.clientY)
        if (domRange) {
          try {
            const slateRange = editor.api.toSlateRange(domRange, {
              exactMatch: false,
              suppressThrow: true
            })
            if (slateRange) {
              editor.tf.focus({ at: slateRange, retries: 5 })
              return
            }
          } catch {
            // fall through to plain focus
          }
        }
      }
      editor.tf.focus({ retries: 5 })
    }

    // Excalidraw keeps the canvas focused through the double-click pointerup —
    // reclaim focus a few frames later.
    const reclaim = () => {
      placeCaretAndFocus()
      timers.push(
        window.setTimeout(placeCaretAndFocus, 0),
        window.setTimeout(placeCaretAndFocus, 32),
        window.setTimeout(placeCaretAndFocus, 80)
      )
    }

    const onPointerUp = () => {
      requestAnimationFrame(reclaim)
    }
    window.addEventListener('pointerup', onPointerUp, { once: true })
    timers.push(window.setTimeout(reclaim, 0))

    return () => {
      cancelled = true
      window.removeEventListener('pointerup', onPointerUp)
      for (const t of timers) window.clearTimeout(t)
    }
  }, [editor])

  return (
    <div
      className="h-full overflow-auto"
      onKeyDown={(event) => event.stopPropagation()}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      <Plate
        editor={editor}
        onChange={({ value }) => {
          if (skipNextChangeRef.current) {
            skipNextChangeRef.current = false
            return
          }
          onValueChange(noteId, value)
        }}
      >
        <EditorContainer>
          <Editor autoFocus variant="none" className="min-h-full p-2 text-sm" />
        </EditorContainer>
      </Plate>
    </div>
  )
}

function NoteCard({
  note,
  active,
  caret,
  onValueChange
}: {
  note: NoteHudItem
  active: boolean
  caret: NoteEditCaret | null
  onValueChange: (noteId: string, value: Value) => void
}) {
  const initialValueRef = useRef(note.plateValue)
  if (!active) {
    initialValueRef.current = note.plateValue
  }

  return (
    <div
      // Inactive: pass all hits to Excalidraw (incl. Plate kids — pointer-events is not inherited).
      className={`absolute overflow-hidden rounded-lg border border-neutral-200 bg-stone-100 shadow-lg ${
        active
          ? 'pointer-events-auto ring-2 ring-neutral-900'
          : 'pointer-events-none [&_*]:pointer-events-none'
      }`}
      data-pdf-note-id={note.id}
    >
      {active ? (
        <NoteEditableBody
          noteId={note.id}
          initialValue={initialValueRef.current}
          caret={caret}
          onValueChange={onValueChange}
        />
      ) : (
        <NoteStaticBody value={note.plateValue} />
      )}
    </div>
  )
}

/**
 * DOM HUD over the solid Excalidraw placeholder (fill must be opaque for interior hit-test).
 * Geometry via ref — never React state on pan/drag.
 */
export const NoteLayer = forwardRef<NoteLayerHandle, NoteLayerProps>(function NoteLayer(
  { notes, activeNoteId, editCaret, onValueChange },
  ref
) {
  const rootRef = useRef<HTMLDivElement>(null)

  useImperativeHandle(ref, () => ({
    applyGeometry(rects) {
      const root = rootRef.current
      if (!root) return
      for (const r of rects) {
        const el = root.querySelector(`[data-pdf-note-id="${CSS.escape(r.id)}"]`)
        if (!(el instanceof HTMLElement)) continue
        el.style.left = `${r.left}px`
        el.style.top = `${r.top}px`
        el.style.width = `${r.width}px`
        el.style.height = `${r.height}px`
      }
    }
  }))

  return (
    <div
      ref={rootRef}
      className={`pointer-events-none absolute inset-0 overflow-hidden ${
        activeNoteId ? 'z-[15]' : 'z-[11]'
      }`}
    >
      {notes.map((note) => (
        <NoteCard
          key={note.id}
          note={note}
          active={note.id === activeNoteId}
          caret={note.id === activeNoteId ? editCaret : null}
          onValueChange={onValueChange}
        />
      ))}
    </div>
  )
})
