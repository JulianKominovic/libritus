'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { SuggestionPlugin } from '@platejs/suggestion/react'
import { useEditorPlugin, usePluginOption } from 'platejs/react'
import * as React from 'react'

import { cn } from '@renderer/lib/utils'

import { ToolbarButton } from './toolbar'

export function SuggestionToolbarButton() {
  const { setOption } = useEditorPlugin(SuggestionPlugin)
  const isSuggesting = usePluginOption(SuggestionPlugin, 'isSuggesting')

  return (
    <ToolbarButton
      className={cn(isSuggesting && 'text-brand/80 hover:text-brand/80')}
      onClick={() => setOption('isSuggesting', !isSuggesting)}
      onMouseDown={(e) => e.preventDefault()}
      tooltip={isSuggesting ? 'Turn off suggesting' : 'Suggestion edits'}
    >
      <DynamicIcon name="pencil-line" />
    </ToolbarButton>
  )
}
