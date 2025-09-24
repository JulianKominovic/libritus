'use client'

import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu'
import { DropdownMenuItemIndicator } from '@radix-ui/react-dropdown-menu'
import { getBlockType, setBlockType } from '@renderer/components/editor/transforms'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@renderer/components/ui/dropdown-menu'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { TElement } from 'platejs'
import { KEYS } from 'platejs'
import { useEditorRef, useSelectionFragmentProp } from 'platejs/react'
import * as React from 'react'

import { ToolbarButton, ToolbarMenuGroup } from './toolbar'

export const turnIntoItems = [
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
    value: 'h1'
  },
  {
    icon: <DynamicIcon name="heading-2" />,
    keywords: ['subtitle', 'h2'],
    label: 'Heading 2',
    value: 'h2'
  },
  {
    icon: <DynamicIcon name="heading-3" />,
    keywords: ['subtitle', 'h3'],
    label: 'Heading 3',
    value: 'h3'
  },
  // {
  //   icon: <DynamicIcon name="heading-4" />,
  //   keywords: ["subtitle", "h4"],
  //   label: "Heading 4",
  //   value: "h4",
  // },
  // {
  //   icon: <DynamicIcon name="heading-5" />,
  //   keywords: ["subtitle", "h5"],
  //   label: "Heading 5",
  //   value: "h5",
  // },
  // {
  //   icon: <DynamicIcon name="heading-6" />,
  //   keywords: ["subtitle", "h6"],
  //   label: "Heading 6",
  //   value: "h6",
  // },
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
    label: 'Toggle list',
    value: KEYS.toggle
  },
  {
    icon: <DynamicIcon name="file-code" />,
    keywords: ['```'],
    label: 'Code',
    value: KEYS.codeBlock
  },
  {
    icon: <DynamicIcon name="quote" />,
    keywords: ['citation', 'blockquote', '>'],
    label: 'Quote',
    value: KEYS.blockquote
  }
]

export function TurnIntoToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef()
  const [open, setOpen] = React.useState(false)

  const value = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as TElement)
  })
  const selectedItem = React.useMemo(
    () => turnIntoItems.find((item) => item.value === (value ?? KEYS.p)) ?? turnIntoItems[0],
    [value]
  )

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton
          className="min-w-[125px] shrink-0"
          pressed={open}
          tooltip="Turn into"
          isDropdown
        >
          {selectedItem.label}
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar min-w-0"
        onCloseAutoFocus={(e) => {
          e.preventDefault()
          editor.tf.focus()
        }}
        align="start"
      >
        <ToolbarMenuGroup
          value={value}
          onValueChange={(type) => {
            setBlockType(editor, type)
          }}
          label="Turn into"
        >
          {turnIntoItems.map(({ icon, label, value: itemValue }) => (
            <DropdownMenuRadioItem
              key={itemValue}
              className="min-w-[180px] pl-2 *:first:[span]:hidden"
              value={itemValue}
            >
              <span className="pointer-events-none absolute right-2 flex size-3.5 items-center justify-center">
                <DropdownMenuItemIndicator>
                  <DynamicIcon name="check" />
                </DropdownMenuItemIndicator>
              </span>
              {icon}
              {label}
            </DropdownMenuRadioItem>
          ))}
        </ToolbarMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
