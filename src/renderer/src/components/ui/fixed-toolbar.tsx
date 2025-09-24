'use client'

import { cn } from '@renderer/lib/utils'

import { Toolbar } from './toolbar'

export function FixedToolbar(props: React.ComponentProps<typeof Toolbar>) {
  return (
    <Toolbar
      {...props}
      className={cn(
        'sticky top-0 left-0 z-50 scrollbar-hide w-full justify-between overflow-x-auto rounded-lg bg-black/5 p-1 backdrop-blur-sm',
        props.className
      )}
    />
  )
}
