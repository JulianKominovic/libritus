'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import type { DropdownMenuProps } from '@radix-ui/react-dropdown-menu'
import { KEYS } from 'platejs'
import { useEditorRef } from 'platejs/react'
import * as React from 'react'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@renderer/components//ui/dropdown-menu'

import { ToolbarButton } from './toolbar'

export function MoreToolbarButton(props: DropdownMenuProps) {
  const editor = useEditorRef()
  const [open, setOpen] = React.useState(false)

  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal={false} {...props}>
      <DropdownMenuTrigger asChild>
        <ToolbarButton pressed={open} tooltip="Insert">
          <DynamicIcon name="more-horizontal" />
        </ToolbarButton>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="ignore-click-outside/toolbar flex max-h-[500px] min-w-[180px] flex-col overflow-y-auto"
        align="start"
      >
        <DropdownMenuGroup>
          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.kbd)
              editor.tf.collapse({ edge: 'end' })
              editor.tf.focus()
            }}
          >
            <DynamicIcon name="keyboard" />
            Keyboard input
          </DropdownMenuItem>

          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.sup, {
                remove: KEYS.sub
              })
              editor.tf.focus()
            }}
          >
            <DynamicIcon name="superscript" />
            Superscript
            {/* (⌘+,) */}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              editor.tf.toggleMark(KEYS.sub, {
                remove: KEYS.sup
              })
              editor.tf.focus()
            }}
          >
            <DynamicIcon name="subscript" />
            Subscript
            {/* (⌘+.) */}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
