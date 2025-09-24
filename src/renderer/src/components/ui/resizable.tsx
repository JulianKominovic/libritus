import { DynamicIcon } from 'lucide-react/dynamic'
import React from 'react'
import * as ResizablePrimitive from 'react-resizable-panels'

import { cn } from '@renderer/lib/utils'

const ResizablePanelGroup = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.PanelGroup>,
  React.ComponentPropsWithoutRef<typeof ResizablePrimitive.PanelGroup>
>(({ className, ...props }, ref) => {
  return (
    <ResizablePrimitive.PanelGroup
      ref={ref}
      data-slot="resizable-panel-group"
      className={cn('flex h-full w-full data-[panel-group-direction=vertical]:flex-col', className)}
      {...props}
    />
  )
})
ResizablePanelGroup.displayName = 'ResizablePanelGroup'

const ResizablePanel = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.Panel>,
  React.ComponentPropsWithoutRef<typeof ResizablePrimitive.Panel>
>((props, ref) => {
  return <ResizablePrimitive.Panel ref={ref} data-slot="resizable-panel" {...props} />
})
ResizablePanel.displayName = 'ResizablePanel'

const ResizableHandle = React.forwardRef<
  React.ElementRef<typeof ResizablePrimitive.PanelResizeHandle>,
  React.ComponentPropsWithoutRef<typeof ResizablePrimitive.PanelResizeHandle> & {
    withHandle?: boolean
  }
>(({ withHandle, className, ...props }, ref) => {
  return (
    <ResizablePrimitive.PanelResizeHandle
      ref={ref}
      data-slot="resizable-handle"
      className={cn(
        'bg-morphing-100 focus-visible:ring-morphing-200 relative flex w-px items-center justify-center hover:bg-blue-300 after:absolute after:inset-y-0 after:left-1/2 after:w-1.5 after:-translate-x-1/2 focus-visible:ring-1 focus-visible:ring-offset-1 focus-visible:outline-hidden data-[panel-group-direction=vertical]:h-px data-[panel-group-direction=vertical]:w-full data-[panel-group-direction=vertical]:after:left-0 data-[panel-group-direction=vertical]:after:h-1 data-[panel-group-direction=vertical]:after:w-full data-[panel-group-direction=vertical]:after:translate-x-0 data-[panel-group-direction=vertical]:after:-translate-y-1/2 [&[data-panel-group-direction=vertical]>div]:rotate-90',
        className
      )}
      {...props}
    >
      {withHandle && (
        <div className="bg-morphing-100 z-10 flex h-4 w-3 items-center justify-center rounded-xs border border-morphing-300">
          <DynamicIcon name="grip-vertical" className="size-2.5" />
        </div>
      )}
    </ResizablePrimitive.PanelResizeHandle>
  )
})
ResizableHandle.displayName = 'ResizableHandle'

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
