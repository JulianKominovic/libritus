import { commentPlugin } from '@renderer/components/editor/plugins/comment-kit'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useEditorRef } from 'platejs/react'

import { ToolbarButton } from './toolbar'

export function CommentToolbarButton() {
  const editor = useEditorRef()

  return (
    <ToolbarButton
      onClick={() => {
        editor.getTransforms(commentPlugin).comment.setDraft()
      }}
      data-plate-prevent-overlay
      tooltip="Comment"
    >
      <DynamicIcon name="message-square-text" />
    </ToolbarButton>
  )
}
