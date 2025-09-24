'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import type { Alignment } from '@platejs/basic-styles'
import { TextAlignPlugin } from '@platejs/basic-styles/react'
import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu'
import { useEditorPlugin, useSelectionFragmentProp } from 'platejs/react'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from '@renderer/components//ui/dropdown-menu'

import { ToolbarButton } from './toolbar'

const items = [
  {
    icon: () => <DynamicIcon name="align-left" />,
    value: 'left'
  },
  {
    icon: () => <DynamicIcon name="align-center" />,
    value: 'center'
  },
  {
    icon: () => <DynamicIcon name="align-right" />,
    value: 'right'
  },
  {
    icon: () => <DynamicIcon name="align-justify" />,
    value: 'justify'
  }
]

export function AlignToolbarButton(props: DropdownMenuProps) {
  const { editor, tf } = useEditorPlugin(TextAlignPlugin)
  const value =
    useSelectionFragmentProp({
      defaultValue: 'start',
      getProp: (node) => node.align
    }) ?? 'left'

  const [open, setOpen] = React.useState(false)
  const IconValue =
    items.find((item) => item.value === value)?.icon ?? (() => <DynamicIcon name="align-left" />)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Align" isDropdown>
          <IconValue />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent className="min-w-0" align="start">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(value) => {
            tf.textAlign.setNodes(value as Alignment)
            editor.tf.focus()
          }}
        >
          {items.map(({ icon: Icon, value: itemValue }) => (
            <DropdownMenuRadioItem
              key={itemValue}
              className="pl-2 data-[state=checked]:bg-accent *:first:[span]:hidden"
              value={itemValue}
            >
              <Icon />
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
