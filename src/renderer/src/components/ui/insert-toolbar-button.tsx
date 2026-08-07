'use client'

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu'
import { insertBlock, insertInlineElement } from '@renderer/components/editor/transforms'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { DynamicIcon } from 'lucide-react/dynamic'
import { KEYS } from 'platejs'
import { type PlateEditor, useEditorRef } from 'platejs/react'
import * as React from 'react'

import { useLang } from '@renderer/i18n/lang-context'

import { ToolbarButton, ToolbarMenuGroup } from './toolbar'

type Group = {
  group: string
  items: Item[]
}

interface Item {
  icon: React.ReactNode
  value: string
  onSelect: (editor: PlateEditor, value: string) => void
  focusEditor?: boolean
  label?: string
}

export function InsertToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef()
  const [open, setOpen] = React.useState(false)
  const { t } = useLang()

  const groups = React.useMemo<Group[]>(
    () => [
      {
        group: t('editor_group_basic_blocks'),
        items: [
          {
            icon: <DynamicIcon name="pilcrow" />,
            label: t('editor_paragraph'),
            value: KEYS.p
          },
          {
            icon: <DynamicIcon name="heading-1" />,
            label: t('editor_heading_1'),
            value: 'h1'
          },
          {
            icon: <DynamicIcon name="heading-2" />,
            label: t('editor_heading_2'),
            value: 'h2'
          },
          {
            icon: <DynamicIcon name="heading-3" />,
            label: t('editor_heading_3'),
            value: 'h3'
          },
          {
            icon: <DynamicIcon name="table" />,
            label: t('editor_table'),
            value: KEYS.table
          },
          {
            icon: <DynamicIcon name="file-code" />,
            label: t('editor_code'),
            value: KEYS.codeBlock
          },
          {
            icon: <DynamicIcon name="quote" />,
            label: t('editor_quote'),
            value: KEYS.blockquote
          },
          {
            icon: <DynamicIcon name="minus" />,
            label: t('editor_divider'),
            value: KEYS.hr
          }
        ].map((item) => ({
          ...item,
          onSelect: (editor, value) => {
            insertBlock(editor, value)
          }
        }))
      },
      {
        group: t('editor_group_lists'),
        items: [
          {
            icon: <DynamicIcon name="list" />,
            label: t('editor_bulleted_list'),
            value: KEYS.ul
          },
          {
            icon: <DynamicIcon name="list-ordered" />,
            label: t('editor_numbered_list'),
            value: KEYS.ol
          },
          {
            icon: <DynamicIcon name="square" />,
            label: t('editor_todo_list'),
            value: KEYS.listTodo
          },
          {
            icon: <DynamicIcon name="chevron-right" />,
            label: t('editor_toggle_list'),
            value: KEYS.toggle
          }
        ].map((item) => ({
          ...item,
          onSelect: (editor, value) => {
            insertBlock(editor, value)
          }
        }))
      },
      {
        group: t('editor_group_media'),
        items: [
          {
            icon: <DynamicIcon name="image" />,
            label: t('editor_image'),
            value: KEYS.img
          },
          {
            icon: <DynamicIcon name="film" />,
            label: t('editor_embed'),
            value: KEYS.mediaEmbed
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
            icon: <DynamicIcon name="link-2" />,
            label: t('editor_link'),
            value: KEYS.link
          },
          {
            focusEditor: true,
            icon: <DynamicIcon name="calendar" />,
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
    ],
    [t]
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip={t('editor_insert')} isDropdown>
          <DynamicIcon name="plus" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="flex max-h-[500px] min-w-0 flex-col overflow-y-auto"
        align="start"
      >
        {groups.map(({ group, items: nestedItems }) => (
          <ToolbarMenuGroup key={group} label={group}>
            {nestedItems.map(({ icon, label, value, onSelect }) => (
              <DropdownMenuItem
                key={value}
                className="min-w-[180px]"
                onSelect={() => {
                  onSelect(editor, value)
                  editor.tf.focus()
                }}
              >
                {icon}
                {label}
              </DropdownMenuItem>
            ))}
          </ToolbarMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
