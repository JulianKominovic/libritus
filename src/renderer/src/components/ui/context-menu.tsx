//@ts-nocheck
import * as ContextMenuPrimitive from '@radix-ui/react-context-menu'
import { cva } from 'class-variance-authority'
import { DynamicIcon } from 'lucide-react/dynamic'
import * as React from 'react'
import { cn } from '@renderer/lib/utils'

const ContextMenu = React.forwardRef<
  typeof ContextMenuPrimitive.Root,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Root>
>(({ ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Root ref={ref as any} data-slot="context-menu" modal={false} {...props} />
  )
})
ContextMenu.displayName = 'ContextMenu'

const ContextMenuTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Trigger>
>(({ ...props }, ref) => {
  return <ContextMenuPrimitive.Trigger ref={ref} data-slot="context-menu-trigger" {...props} />
})
ContextMenuTrigger.displayName = 'ContextMenuTrigger'

const ContextMenuGroup = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Group>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Group>
>(({ ...props }, ref) => {
  return <ContextMenuPrimitive.Group ref={ref} data-slot="context-menu-group" {...props} />
})
ContextMenuGroup.displayName = 'ContextMenuGroup'

const ContextMenuPortal = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Portal>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Portal>
>(({ ...props }, ref) => {
  return <ContextMenuPrimitive.Portal ref={ref} data-slot="context-menu-portal" {...props} />
})
ContextMenuPortal.displayName = 'ContextMenuPortal'

const ContextMenuSub = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Sub>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Sub>
>(({ ...props }, ref) => {
  return <ContextMenuPrimitive.Sub ref={ref} data-slot="context-menu-sub" {...props} />
})
ContextMenuSub.displayName = 'ContextMenuSub'

const ContextMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioGroup>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioGroup>
>(({ ...props }, ref) => {
  return (
    <ContextMenuPrimitive.RadioGroup ref={ref} data-slot="context-menu-radio-group" {...props} />
  )
})
ContextMenuRadioGroup.displayName = 'ContextMenuRadioGroup'

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubTrigger>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubTrigger> & {
    inset?: boolean
  }
>(({ className, inset, children, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.SubTrigger
      ref={ref}
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "focus:bg-accent focus:text-accent-foreground data-[state=open]:bg-accent data-[state=open]:text-accent-foreground flex cursor-default items-center rounded-sm px-2 py-1.5 text-sm outline-hidden select-none data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <DynamicIcon name="chevron-right" className="ml-auto" />
    </ContextMenuPrimitive.SubTrigger>
  )
})
ContextMenuSubTrigger.displayName = 'ContextMenuSubTrigger'

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubContent>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.SubContent>
>(({ className, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.SubContent
      ref={ref}
      data-slot="context-menu-sub-content"
      className={cn(
        'bg-morphing-50 text-morphing-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-md border p-1 shadow-lg',
        className
      )}
      {...props}
    />
  )
})
ContextMenuSubContent.displayName = 'ContextMenuSubContent'

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Content>
>(({ className, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        ref={ref}
        data-slot="context-menu-content"
        className={cn(
          'bg-morphing-50 text-morphing-900 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-xl border p-1 shadow-md border-morphing-300 shadow-morphing-900/20',
          className
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
})
ContextMenuContent.displayName = 'ContextMenuContent'

export const contextMenuVariants = cva(
  "[&_svg:not([class*='text-'])]:text-muted-foreground relative flex cursor-default items-center gap-2 rounded-lg px-2 py-1.5 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 data-[inset]:pl-8 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 w-full",
  {
    variants: {
      variant: {
        default: 'bg-morphing-50 text-morphing-900 focus:bg-morphing-100 focus:text-morphing-900',
        destructive:
          'focus:!bg-destructive/10 hover:bg-destructive/10 text-destructive focus:text-destructive *:!text-destructive'
      }
    }
  }
)

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Item> & {
    inset?: boolean
    variant?: 'default' | 'destructive'
  }
>(({ className, inset, variant = 'default', ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(contextMenuVariants({ variant }), className)}
      {...props}
    />
  )
})
ContextMenuItem.displayName = 'ContextMenuItem'

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.CheckboxItem>
>(({ className, children, checked, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="context-menu-checkbox-item"
      className={cn(
        "focus:bg-morphing-100 focus:text-morphing-900 relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <DynamicIcon name="check" className="size-4" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
})
ContextMenuCheckboxItem.displayName = 'ContextMenuCheckboxItem'

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.RadioItem>
>(({ className, children, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      data-slot="context-menu-radio-item"
      className={cn(
        "focus:bg-accent focus:text-accent-foreground relative flex cursor-default items-center gap-2 rounded-sm py-1.5 pr-2 pl-8 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="pointer-events-none absolute left-2 flex size-3.5 items-center justify-center">
        <ContextMenuPrimitive.ItemIndicator>
          <DynamicIcon name="circle" className="size-2 fill-current" />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )
})
ContextMenuRadioItem.displayName = 'ContextMenuRadioItem'

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Label>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Label> & {
    inset?: boolean
  }
>(({ className, inset, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Label
      ref={ref}
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn('text-foreground px-2 py-1.5 text-sm font-medium data-[inset]:pl-8', className)}
      {...props}
    />
  )
})
ContextMenuLabel.displayName = 'ContextMenuLabel'

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof ContextMenuPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      data-slot="context-menu-separator"
      className={cn('bg-morphing-100 -mx-1 my-1 h-px', className)}
      {...props}
    />
  )
})
ContextMenuSeparator.displayName = 'ContextMenuSeparator'

const ContextMenuShortcut = React.forwardRef<
  React.ElementRef<'span'>,
  React.ComponentPropsWithoutRef<'span'>
>(({ className, ...props }, ref) => {
  return (
    <span
      ref={ref}
      data-slot="context-menu-shortcut"
      className={cn('text-muted-foreground ml-auto text-xs tracking-widest', className)}
      {...props}
    />
  )
})
ContextMenuShortcut.displayName = 'ContextMenuShortcut'

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup
}
