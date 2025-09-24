'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { KEYS } from 'platejs'
import { useEditorReadOnly } from 'platejs/react'

import { AIToolbarButton } from './ai-toolbar-button'
import { InlineEquationToolbarButton } from './equation-toolbar-button'
import { LinkToolbarButton } from './link-toolbar-button'
import { MarkToolbarButton } from './mark-toolbar-button'
import { MoreToolbarButton } from './more-toolbar-button'
import { TurnIntoToolbarButton } from './turn-into-toolbar-button'

export function FloatingToolbarButtons() {
  const readOnly = useEditorReadOnly()

  return (
    <>
      {!readOnly && (
        <>
          <AIToolbarButton tooltip="AI commands">
            <DynamicIcon name="wand-sparkles" />
            Ask AI
          </AIToolbarButton>

          <TurnIntoToolbarButton />

          <MarkToolbarButton nodeType={KEYS.bold} tooltip="Bold (⌘+B)">
            <DynamicIcon name="bold" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.italic} tooltip="Italic (⌘+I)">
            <DynamicIcon name="italic" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.underline} tooltip="Underline (⌘+U)">
            <DynamicIcon name="underline" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip="Strikethrough (⌘+⇧+M)">
            <DynamicIcon name="strikethrough" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.code} tooltip="Code (⌘+E)">
            <DynamicIcon name="code-2" />
          </MarkToolbarButton>

          <InlineEquationToolbarButton />

          <LinkToolbarButton />
        </>
      )}

      {!readOnly && <MoreToolbarButton />}
    </>
  )
}
