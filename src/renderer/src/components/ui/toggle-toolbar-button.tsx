'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { useToggleToolbarButton, useToggleToolbarButtonState } from '@platejs/toggle/react'
import type * as React from 'react'

import { ToolbarButton } from './toolbar'

export function ToggleToolbarButton(props: React.ComponentProps<typeof ToolbarButton>) {
  const state = useToggleToolbarButtonState()
  const { props: buttonProps } = useToggleToolbarButton(state)

  return (
    <ToolbarButton {...props} {...buttonProps} tooltip="Toggle">
      <DynamicIcon name="list-collapse" />
    </ToolbarButton>
  )
}
