'use client'

import { AIChatPlugin } from '@platejs/ai/react'
import { DynamicIcon } from 'lucide-react/dynamic'
import { KEYS, type TComboboxInputElement } from 'platejs'
import type { PlateEditor, PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import type * as React from 'react'

import { insertBlock, insertInlineElement } from '@renderer/components/editor/transforms'
import { useLang } from '@renderer/i18n/lang-context'

import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxGroupLabel,
  InlineComboboxInput,
  InlineComboboxItem
} from './inline-combobox'

type Group = {
  group: string
  items: {
    icon: React.ReactNode
    value: string
    onSelect: (editor: PlateEditor, value: string) => void
    className?: string
    focusEditor?: boolean
    keywords?: string[]
    label?: string
  }[]
}

const getGroups = (t: ReturnType<typeof useLang>['t']): Group[] => [
  {
    group: t('slash_group_ai'),
    items: [
      {
        focusEditor: false,
        icon: <DynamicIcon name="sparkles" />,
        value: 'AI',
        onSelect: (editor) => {
          editor.getApi(AIChatPlugin).aiChat.show()
        }
      }
    ]
  },
  {
    group: t('editor_group_basic_blocks'),
    items: [
      {
        icon: <DynamicIcon name="pilcrow" />,
        keywords: ['paragraph'],
        label: t('editor_text'),
        value: KEYS.p
      },
      {
        icon: <DynamicIcon name="heading-1" />,
        keywords: ['title', 'h1'],
        label: t('editor_heading_1'),
        value: KEYS.h1
      },
      {
        icon: <DynamicIcon name="heading-2" />,
        keywords: ['subtitle', 'h2'],
        label: t('editor_heading_2'),
        value: KEYS.h2
      },
      {
        icon: <DynamicIcon name="heading-3" />,
        keywords: ['subtitle', 'h3'],
        label: t('editor_heading_3'),
        value: KEYS.h3
      },
      {
        icon: <DynamicIcon name="list" />,
        keywords: ['unordered', 'ul', '-'],
        label: t('editor_bulleted_list'),
        value: KEYS.ul
      },
      {
        icon: <DynamicIcon name="list-ordered" />,
        keywords: ['ordered', 'ol', '1'],
        label: t('editor_numbered_list'),
        value: KEYS.ol
      },
      {
        icon: <DynamicIcon name="square" />,
        keywords: ['checklist', 'task', 'checkbox', '[]'],
        label: t('editor_todo_list'),
        value: KEYS.listTodo
      },
      {
        icon: <DynamicIcon name="chevron-right" />,
        keywords: ['collapsible', 'expandable'],
        label: t('editor_toggle_list'),
        value: KEYS.toggle
      },
      {
        icon: <DynamicIcon name="code-2" />,
        keywords: ['```'],
        label: t('editor_code_block'),
        value: KEYS.codeBlock
      },
      {
        icon: <DynamicIcon name="table" />,
        label: t('editor_table'),
        value: KEYS.table
      },
      {
        icon: <DynamicIcon name="quote" />,
        keywords: ['citation', 'blockquote', 'quote', '>'],
        label: t('editor_blockquote'),
        value: KEYS.blockquote
      },
      {
        description: t('editor_callout_desc'),
        icon: <DynamicIcon name="lightbulb" />,
        keywords: ['note'],
        label: t('editor_callout'),
        value: KEYS.callout
      }
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value)
      }
    }))
  },
  {
    group: t('editor_group_advanced_blocks'),
    items: [
      {
        focusEditor: false,
        icon: <DynamicIcon name="radical" />,
        label: t('editor_equation'),
        value: KEYS.equation
      }
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertBlock(editor, value)
      }
    }))
  },
  {
    group: t('editor_group_inline'),
    items: [
      {
        focusEditor: true,
        icon: <DynamicIcon name="calendar" />,
        keywords: ['time'],
        label: t('editor_date'),
        value: KEYS.date
      },
      {
        focusEditor: false,
        icon: <DynamicIcon name="radical" />,
        label: t('editor_inline_equation'),
        value: KEYS.inlineEquation
      }
    ].map((item) => ({
      ...item,
      onSelect: (editor, value) => {
        insertInlineElement(editor, value)
      }
    }))
  }
]

export function SlashInputElement(props: PlateElementProps<TComboboxInputElement>) {
  const { editor, element } = props
  const { t } = useLang()
  const groups = getGroups(t)

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>{t('editor_no_results')}</InlineComboboxEmpty>

          {groups.map(({ group, items }) => (
            <InlineComboboxGroup key={group}>
              <InlineComboboxGroupLabel>{group}</InlineComboboxGroupLabel>

              {items.map(({ focusEditor, icon, keywords, label, value, onSelect }) => (
                <InlineComboboxItem
                  key={value}
                  value={value}
                  onClick={() => onSelect(editor, value)}
                  label={label}
                  focusEditor={focusEditor}
                  group={group}
                  keywords={keywords}
                >
                  <div className="mr-2 text-muted-foreground">{icon}</div>
                  {label ?? value}
                </InlineComboboxItem>
              ))}
            </InlineComboboxGroup>
          ))}
        </InlineComboboxContent>
      </InlineCombobox>

      {props.children}
    </PlateElement>
  )
}
