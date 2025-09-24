'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { AIChatPlugin } from '@platejs/ai/react'
import { KEYS, type TComboboxInputElement } from 'platejs'
import type { PlateEditor, PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import type * as React from 'react'

import { insertBlock, insertInlineElement } from '@renderer/components//editor/transforms'

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

const groups: Group[] = [
  {
    group: 'AI',
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
    group: 'Basic blocks',
    items: [
      {
        icon: <DynamicIcon name="pilcrow" />,
        keywords: ['paragraph'],
        label: 'Text',
        value: KEYS.p
      },
      {
        icon: <DynamicIcon name="heading-1" />,
        keywords: ['title', 'h1'],
        label: 'Heading 1',
        value: KEYS.h1
      },
      {
        icon: <DynamicIcon name="heading-2" />,
        keywords: ['subtitle', 'h2'],
        label: 'Heading 2',
        value: KEYS.h2
      },
      {
        icon: <DynamicIcon name="heading-3" />,
        keywords: ['subtitle', 'h3'],
        label: 'Heading 3',
        value: KEYS.h3
      },
      {
        icon: <DynamicIcon name="list" />,
        keywords: ['unordered', 'ul', '-'],
        label: 'Bulleted list',
        value: KEYS.ul
      },
      {
        icon: <DynamicIcon name="list-ordered" />,
        keywords: ['ordered', 'ol', '1'],
        label: 'Numbered list',
        value: KEYS.ol
      },
      {
        icon: <DynamicIcon name="square" />,
        keywords: ['checklist', 'task', 'checkbox', '[]'],
        label: 'To-do list',
        value: KEYS.listTodo
      },
      {
        icon: <DynamicIcon name="chevron-right" />,
        keywords: ['collapsible', 'expandable'],
        label: 'Toggle',
        value: KEYS.toggle
      },
      {
        icon: <DynamicIcon name="code-2" />,
        keywords: ['```'],
        label: 'Code Block',
        value: KEYS.codeBlock
      },
      {
        icon: <DynamicIcon name="table" />,
        label: 'Table',
        value: KEYS.table
      },
      {
        icon: <DynamicIcon name="quote" />,
        keywords: ['citation', 'blockquote', 'quote', '>'],
        label: 'Blockquote',
        value: KEYS.blockquote
      },
      {
        description: 'Insert a highlighted block.',
        icon: <DynamicIcon name="lightbulb" />,
        keywords: ['note'],
        label: 'Callout',
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
    group: 'Advanced blocks',
    items: [
      {
        focusEditor: false,
        icon: <DynamicIcon name="radical" />,
        label: 'Equation',
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
    group: 'Inline',
    items: [
      {
        focusEditor: true,
        icon: <DynamicIcon name="calendar" />,
        keywords: ['time'],
        label: 'Date',
        value: KEYS.date
      },
      {
        focusEditor: false,
        icon: <DynamicIcon name="radical" />,
        label: 'Inline Equation',
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

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="/">
        <InlineComboboxInput />

        <InlineComboboxContent>
          <InlineComboboxEmpty>No results</InlineComboboxEmpty>

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
