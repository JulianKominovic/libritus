'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { KEYS } from 'platejs'
import { useEditorReadOnly } from 'platejs/react'

import { useLang } from '@renderer/i18n/lang-context'

import { InlineEquationToolbarButton } from './equation-toolbar-button'
import { LinkToolbarButton } from './link-toolbar-button'
import { MarkToolbarButton } from './mark-toolbar-button'
import { MoreToolbarButton } from './more-toolbar-button'
import { TurnIntoToolbarButton } from './turn-into-toolbar-button'

/** Floating selection toolbar for canvas notes — without Ask AI. */
export function NoteFloatingToolbarButtons() {
  const readOnly = useEditorReadOnly()
  const { t } = useLang()

  return (
    <>
      {!readOnly && (
        <>
          <TurnIntoToolbarButton />

          <MarkToolbarButton nodeType={KEYS.bold} tooltip={t('editor_bold')}>
            <DynamicIcon name="bold" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.italic} tooltip={t('editor_italic')}>
            <DynamicIcon name="italic" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.underline} tooltip={t('editor_underline')}>
            <DynamicIcon name="underline" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.strikethrough} tooltip={t('editor_strikethrough')}>
            <DynamicIcon name="strikethrough" />
          </MarkToolbarButton>

          <MarkToolbarButton nodeType={KEYS.code} tooltip={t('editor_code')}>
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
