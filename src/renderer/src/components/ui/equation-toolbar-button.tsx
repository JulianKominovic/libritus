'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { insertInlineEquation } from '@platejs/math'
import { useEditorRef } from 'platejs/react'
import type * as React from 'react'

import { ToolbarButton } from './toolbar'

export function InlineEquationToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const editor = useEditorRef()

  return (
    <ToolbarButton
      {...props}
      onClick={() => {
        insertInlineEquation(editor)
      }}
      tooltip="Mark as equation"
    >
      <DynamicIcon name="radical" />
    </ToolbarButton>
  )
}
