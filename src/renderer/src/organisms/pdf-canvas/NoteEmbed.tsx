import { BaseEditorKit } from '@renderer/components/editor/editor-base-kit'
import { NoteEditorKit } from '@renderer/components/editor/note-editor-kit'
import { Editor, EditorContainer } from '@renderer/components/ui/editor'
import { EditorStatic } from '@renderer/components/ui/editor-static'
import { createSlateEditor, type Value } from 'platejs'
import { Plate, usePlateEditor } from 'platejs/react'
import { memo, useEffect, useMemo, useRef } from 'react'

type NoteEmbedProps = {
  noteId: string
  plateValue: Value
  editing: boolean
  onValueChange: (noteId: string, value: Value) => void
  onExitEdit: () => void
}

function NoteStaticBody({ value }: { value: Value }) {
  // usePlateEditor adds NavigationFeedbackPlugin (hooks in transformProps).
  // PlateStatic has no Plate store → crash. createSlateEditor = static-only core.
  const editor = useMemo(() => createSlateEditor({ plugins: BaseEditorKit, value }), [value])
  return (
    <EditorStatic editor={editor} variant="none" className="h-full overflow-hidden p-2 text-sm" />
  )
}

function NoteEditableBody({
  noteId,
  initialValue,
  onValueChange,
  onExitEdit
}: {
  noteId: string
  initialValue: Value
  onValueChange: (noteId: string, value: Value) => void
  onExitEdit: () => void
}) {
  const editor = usePlateEditor({
    id: noteId,
    plugins: NoteEditorKit,
    value: initialValue
  })
  const skipNextChangeRef = useRef(true)

  useEffect(() => {
    let cancelled = false
    const timers: number[] = []
    const focus = () => {
      if (!cancelled) editor.tf.focus({ retries: 5 })
    }
    timers.push(
      window.setTimeout(focus, 0),
      window.setTimeout(focus, 32),
      window.setTimeout(focus, 120)
    )
    return () => {
      cancelled = true
      for (const t of timers) window.clearTimeout(t)
    }
  }, [editor])

  return (
    <div
      className="flex h-full flex-col overflow-hidden"
      // Excalidraw document cut/copy skips only isWritableElement (not Plate
      // contenteditable) → Cmd+X deleted the note. Stop keyboard + clipboard bubble.
      onKeyDown={(event) => {
        event.stopPropagation()
        if (event.key === 'Escape') {
          event.preventDefault()
          onExitEdit()
        }
      }}
      onKeyUp={(event) => event.stopPropagation()}
      onCut={(event) => event.stopPropagation()}
      onCopy={(event) => event.stopPropagation()}
      onPaste={(event) => event.stopPropagation()}
      onPointerDown={(event) => {
        event.stopPropagation()
        // Preserve Slate selection when pressing toolbar controls (Plate uses
        // mousedown preventDefault; pointerdown focus can still collapse it).
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('button, [role="radio"], [role="button"], [data-radix-collection-item]')
        ) {
          event.preventDefault()
        }
      }}
      onMouseDown={(event) => event.stopPropagation()}
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
        <EditorContainer className="h-full min-h-0 overflow-auto">
          <Editor autoFocus variant="none" className="min-h-full p-2 text-sm" />
        </EditorContainer>
      </Plate>
    </div>
  )
}

/**
 * Plate content inside Excalidraw's embeddable container (scene-sized + CSS scale(zoom)).
 * Editing follows Excalidraw activeEmbeddable (click center to interact).
 * memo: Excalidraw re-renders on every embed "hover" pointermove; skip Plate static.
 */
export const NoteEmbed = memo(function NoteEmbed({
  noteId,
  plateValue,
  editing,
  onValueChange,
  onExitEdit
}: NoteEmbedProps) {
  const initialValueRef = useRef(plateValue)
  if (!editing) {
    initialValueRef.current = plateValue
  }

  return (
    <div
      className="box-border h-full w-full overflow-hidden bg-neutral-50"
      data-pdf-note-id={noteId}
      data-pdf-note
      data-editing={editing ? '' : undefined}
    >
      {editing ? (
        <NoteEditableBody
          noteId={noteId}
          initialValue={initialValueRef.current}
          onValueChange={onValueChange}
          onExitEdit={onExitEdit}
        />
      ) : (
        <NoteStaticBody value={plateValue} />
      )}
    </div>
  )
})
