'use client'

import { DynamicIcon } from 'lucide-react/dynamic'
import { useToggleButton, useToggleButtonState } from '@platejs/toggle/react'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'

import { Button } from '@renderer/components//ui/button'

export function ToggleElement(props: PlateElementProps) {
  const element = props.element
  const state = useToggleButtonState(element.id as string)
  const { buttonProps, open } = useToggleButton(state)

  return (
    <PlateElement {...props} className="pl-6">
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-0 -left-0.5 size-6 cursor-pointer items-center justify-center rounded-md p-px text-muted-foreground transition-colors select-none hover:bg-accent [&_svg]:size-4"
        contentEditable={false}
        {...buttonProps}
      >
        <DynamicIcon
          name="chevron-right"
          className={
            open
              ? 'rotate-90 transition-transform duration-75'
              : 'rotate-0 transition-transform duration-75'
          }
        />
      </Button>
      {props.children}
    </PlateElement>
  )
}
