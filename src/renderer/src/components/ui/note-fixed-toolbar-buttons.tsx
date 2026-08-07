'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { KEYS } from 'platejs'
import { useEditorReadOnly } from 'platejs/react'

import { useLang } from '@renderer/i18n/lang-context'

import { AlignToolbarButton } from './align-toolbar-button'
import { IndentToolbarButton, OutdentToolbarButton } from './indent-toolbar-button'
import { InsertToolbarButton } from './insert-toolbar-button'
import {
  BulletedListToolbarButton,
  NumberedListToolbarButton,
  TodoListToolbarButton
} from './list-toolbar-button'
import { MarkToolbarButton } from './mark-toolbar-button'
import { TableToolbarButton } from './table-toolbar-button'
import { ToggleToolbarButton } from './toggle-toolbar-button'
import { ToolbarGroup } from './toolbar'
import { TurnIntoToolbarButton } from './turn-into-toolbar-button'

/** Fixed toolbar for canvas notes — same as essays, without AI. */
export function NoteFixedToolbarButtons() {
  const readOnly = useEditorReadOnly()
  const { t } = useLang()

  return (
    <div className="flex w-full">
      {!readOnly && (
        <>
          <ToolbarGroup>
            <InsertToolbarButton />
            <TurnIntoToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <MarkToolbarButton
              nodeType={KEYS.bold}
              tooltip={t('editor_bold')}
              aria-label={t('editor_bold')}
              data-testid="note-toolbar-bold"
            >
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
          </ToolbarGroup>

          <ToolbarGroup>
            <AlignToolbarButton />

            <NumberedListToolbarButton />
            <BulletedListToolbarButton />
            <TodoListToolbarButton />
            <ToggleToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <TableToolbarButton />
          </ToolbarGroup>

          <ToolbarGroup>
            <OutdentToolbarButton />
            <IndentToolbarButton />
          </ToolbarGroup>
        </>
      )}

      <ToolbarGroup>
        <MarkToolbarButton nodeType={KEYS.highlight} tooltip={t('editor_highlight')}>
          <DynamicIcon name="highlighter" />
        </MarkToolbarButton>
      </ToolbarGroup>
    </div>
  )
}
