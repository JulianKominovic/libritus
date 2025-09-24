import { Plate, type TPlateEditor, usePlateEditor } from 'platejs/react'

import { Editor, EditorContainer, EditorView } from '@renderer/components//ui/editor'
import type { Value } from 'platejs'
import { EditorKit } from './editor-kit'
import { BaseEditorKit } from './editor-base-kit'

export function PlateEditor({
  className,
  editor = usePlateEditor({
    plugins: EditorKit
  })
}: {
  className?: string
  editor?: TPlateEditor<Value, (typeof EditorKit)[number]>
}) {
  return (
    <Plate editor={editor}>
      <EditorContainer>
        <Editor focused variant="none" className={className} />
      </EditorContainer>
    </Plate>
  )
}
