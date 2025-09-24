'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { useEditorRef, useEditorSelector } from 'platejs/react'
import type * as React from 'react'

import { ToolbarButton } from './toolbar'

export function RedoToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef()
  const disabled = useEditorSelector((editor) => editor.history.redos.length === 0, [])

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.redo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Redo"
    >
      <DynamicIcon name="redo-2" />
    </ToolbarButton>
  )
}

export function UndoToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef()
  const disabled = useEditorSelector((editor) => editor.history.undos.length === 0, [])

  return (
    <ToolbarButton
      {...props}
      disabled={disabled}
      onClick={() => editor.undo()}
      onMouseDown={(e) => e.preventDefault()}
      tooltip="Undo"
    >
      <DynamicIcon name="undo-2" />
    </ToolbarButton>
  )
}
