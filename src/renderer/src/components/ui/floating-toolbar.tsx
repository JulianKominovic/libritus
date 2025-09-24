'use client'

import {
  type FloatingToolbarState,
  flip,
  offset,
  useFloatingToolbar,
  useFloatingToolbarState
} from '@platejs/floating'
import { useComposedRef } from '@udecode/cn'
import { KEYS } from 'platejs'
import { useEditorId, useEventEditorValue, usePluginOption } from 'platejs/react'
import type * as React from 'react'

import { cn } from '@renderer/lib/utils'

import { Toolbar } from './toolbar'

export function FloatingToolbar({
  children,
  className,
  state,
  ...props
}: React.ComponentProps<typeof Toolbar> & {
  state?: FloatingToolbarState
}) {
  const editorId = useEditorId()
  const focusedEditorId = useEventEditorValue('focus')
  const isFloatingLinkOpen = !!usePluginOption({ key: KEYS.link }, 'mode')
  const isAIChatOpen = usePluginOption({ key: KEYS.aiChat }, 'open')

  const floatingToolbarState = useFloatingToolbarState({
    editorId,
    focusedEditorId,
    hideToolbar: isFloatingLinkOpen || isAIChatOpen,
    ...state,
    floatingOptions: {
      middleware: [
        offset(12),
        flip({
          fallbackPlacements: ['top-start', 'top-end', 'bottom-start', 'bottom-end'],
          padding: 12
        })
      ],
      placement: 'top',
      ...state?.floatingOptions
    }
  })

  const {
    clickOutsideRef,
    hidden,
    props: rootProps,
    ref: floatingRef
  } = useFloatingToolbar(floatingToolbarState)

  const ref = useComposedRef<HTMLDivElement>(props.ref, floatingRef)

  if (hidden) return null

  return (
    <div ref={clickOutsideRef}>
      <Toolbar
        {...props}
        {...rootProps}
        ref={ref}
        className={cn(
          'absolute z-50 scrollbar-hide overflow-x-auto rounded-md border border-border bg-popover p-1 whitespace-nowrap opacity-100 shadow-md print:hidden !left-0 w-full max-w-fit',
          className
        )}
      >
        {children}
      </Toolbar>
    </div>
  )
}
