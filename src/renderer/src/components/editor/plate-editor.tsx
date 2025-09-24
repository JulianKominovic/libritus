import { Plate, type TPlateEditor, usePlateEditor } from 'platejs/react'

import { Editor, EditorContainer } from '@renderer/components/ui/editor'
import type { Value } from 'platejs'
import { EditorKit } from './editor-kit'

export function PlateEditor({
  className,
  // eslint-disable-next-line react-hooks/rules-of-hooks
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
