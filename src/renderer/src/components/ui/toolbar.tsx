'use client'

import * as ToolbarPrimitive from '@radix-ui/react-toolbar'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { type VariantProps, cva } from 'class-variance-authority'
import { DynamicIcon } from 'lucide-react/dynamic'
import * as React from 'react'

import {
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator
} from '@renderer/components/ui/dropdown-menu'
import { Separator } from '@renderer/components/ui/separator'
import { Tooltip, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { cn } from '@renderer/lib/utils'

export const Toolbar = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Root>,
  React.ComponentProps<typeof ToolbarPrimitive.Root>
>(({ className, ...props }, ref) => {
  return (
    <ToolbarPrimitive.Root
      ref={ref}
      className={cn('relative flex items-center select-none', className)}
      {...props}
    />
  )
})
Toolbar.displayName = 'Toolbar'

export const ToolbarToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.ToolbarToggleGroup>,
  React.ComponentProps<typeof ToolbarPrimitive.ToolbarToggleGroup>
>(({ className, ...props }, ref) => {
  return (
    <ToolbarPrimitive.ToolbarToggleGroup
      ref={ref}
      className={cn('flex items-center shrink-0', className)}
      {...props}
    />
  )
})
ToolbarToggleGroup.displayName = 'ToolbarToggleGroup'

export const ToolbarLink = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Link>,
  React.ComponentProps<typeof ToolbarPrimitive.Link>
>(({ className, ...props }, ref) => {
  return (
    <ToolbarPrimitive.Link
      ref={ref}
      className={cn('font-medium underline underline-offset-4', className)}
      {...props}
    />
  )
})
ToolbarLink.displayName = 'ToolbarLink'

export const ToolbarSeparator = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.Separator>,
  React.ComponentProps<typeof ToolbarPrimitive.Separator>
>(({ className, ...props }, ref) => {
  return (
    <ToolbarPrimitive.Separator
      ref={ref}
      className={cn('mx-2 my-1 w-px shrink-0 bg-border', className)}
      {...props}
    />
  )
})
ToolbarSeparator.displayName = 'ToolbarSeparator'

// From toggleVariants
const toolbarButtonVariants = cva(
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-md text-sm font-medium whitespace-nowrap transition-[color,box-shadow] outline-none hover:bg-black/5 hover:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-checked:bg-black/5 aria-checked:text-accent-foreground aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 flex-shrink-0",
  {
    defaultVariants: {
      size: 'default',
      variant: 'default'
    },
    variants: {
      size: {
        default: 'h-9 min-w-9 px-2',
        lg: 'h-10 min-w-10 px-2.5',
        sm: 'h-8 min-w-8 px-1.5'
      },
      variant: {
        default: 'bg-transparent',
        outline:
          'border border-input bg-transparent shadow-xs hover:bg-accent hover:text-accent-foreground'
      }
    }
  }
)

const dropdownArrowVariants = cva(
  cn(
    'inline-flex items-center justify-center rounded-r-md text-sm font-medium text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50'
  ),
  {
    defaultVariants: {
      size: 'sm',
      variant: 'default'
    },
    variants: {
      size: {
        default: 'h-9 w-6',
        lg: 'h-10 w-8',
        sm: 'h-8 w-4'
      },
      variant: {
        default:
          'bg-transparent hover:bg-muted hover:text-muted-foreground aria-checked:bg-accent aria-checked:text-accent-foreground',
        outline:
          'border border-l-0 border-border bg-transparent hover:bg-accent hover:text-accent-foreground'
      }
    }
  }
)

type ToolbarButtonProps = {
  isDropdown?: boolean
  pressed?: boolean
} & Omit<React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>, 'asChild' | 'value'> &
  VariantProps<typeof toolbarButtonVariants>

const ToolbarButtonComponent = React.forwardRef<HTMLButtonElement, ToolbarButtonProps>(
  function ToolbarButton(
    { children, className, isDropdown, pressed, size = 'sm', variant, ...props },
    ref
  ) {
    return typeof pressed === 'boolean' ? (
      <ToolbarToggleGroup disabled={props.disabled} value="single" type="single">
        <ToolbarToggleItem
          ref={ref as React.Ref<React.ElementRef<typeof ToolbarToggleItem>>}
          className={cn(
            toolbarButtonVariants({
              size,
              variant
            }),
            isDropdown && 'justify-between gap-1 pr-1',
            className
          )}
          value={pressed ? 'single' : ''}
          {...props}
        >
          {isDropdown ? (
            <>
              <div className="flex flex-1 items-center gap-2 whitespace-nowrap">{children}</div>
              <div>
                <DynamicIcon
                  name="chevron-down"
                  className="size-3.5 text-muted-foreground"
                  data-icon
                />
              </div>
            </>
          ) : (
            children
          )}
        </ToolbarToggleItem>
      </ToolbarToggleGroup>
    ) : (
      <ToolbarPrimitive.Button
        ref={ref}
        className={cn(
          toolbarButtonVariants({
            size,
            variant
          }),
          isDropdown && 'pr-1',
          className
        )}
        {...props}
      >
        {children}
      </ToolbarPrimitive.Button>
    )
  }
)
ToolbarButtonComponent.displayName = 'ToolbarButton'

export const ToolbarButton = withTooltip(ToolbarButtonComponent)

export const ToolbarSplitButton = React.forwardRef<
  React.ElementRef<typeof ToolbarButton>,
  React.ComponentPropsWithoutRef<typeof ToolbarButton>
>(({ className, ...props }, ref) => {
  return (
    <ToolbarButton
      ref={ref}
      className={cn('group flex-shrink-0 flex gap-0 px-0 hover:bg-transparent', className)}
      {...props}
    />
  )
})
ToolbarSplitButton.displayName = 'ToolbarSplitButton'

type ToolbarSplitButtonPrimaryProps = Omit<
  React.ComponentPropsWithoutRef<typeof ToolbarToggleItem>,
  'value'
> &
  VariantProps<typeof toolbarButtonVariants>

export const ToolbarSplitButtonPrimary = React.forwardRef<
  HTMLSpanElement,
  ToolbarSplitButtonPrimaryProps
>(({ children, className, size = 'sm', variant, ...props }, ref) => {
  return (
    <span
      ref={ref}
      className={cn(
        toolbarButtonVariants({
          size,
          variant
        }),
        'rounded-r-none',
        'group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground',
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
})
ToolbarSplitButtonPrimary.displayName = 'ToolbarSplitButtonPrimary'

export const ToolbarSplitButtonSecondary = React.forwardRef<
  HTMLButtonElement,
  React.ComponentPropsWithoutRef<'button'> & VariantProps<typeof dropdownArrowVariants>
>(({ className, size, variant, ...props }, ref) => {
  return (
    <button
      ref={ref}
      className={cn(
        dropdownArrowVariants({
          size,
          variant
        }),
        'group-data-[pressed=true]:bg-accent group-data-[pressed=true]:text-accent-foreground',
        className
      )}
      onClick={(e) => e.stopPropagation()}
      {...props}
    >
      <DynamicIcon name="chevron-down" className="size-3.5 text-muted-foreground" data-icon />
    </button>
  )
})
ToolbarSplitButtonSecondary.displayName = 'ToolbarSplitButtonSecondary'

export const ToolbarToggleItem = React.forwardRef<
  React.ElementRef<typeof ToolbarPrimitive.ToggleItem>,
  React.ComponentProps<typeof ToolbarPrimitive.ToggleItem> &
    VariantProps<typeof toolbarButtonVariants>
>(({ className, size = 'sm', variant, ...props }, ref) => {
  return (
    <ToolbarPrimitive.ToggleItem
      ref={ref}
      className={cn(toolbarButtonVariants({ size, variant }), className)}
      {...props}
    />
  )
})
ToolbarToggleItem.displayName = 'ToolbarToggleItem'

export const ToolbarGroup = React.forwardRef<HTMLDivElement, React.ComponentProps<'div'>>(
  ({ children, className, ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'group/toolbar-group',
          'relative hidden has-[button]:flex shrink-0',
          className
        )}
        {...props}
      >
        <div className="flex items-center">{children}</div>

        <div className="mx-1.5 py-0.5 group-last/toolbar-group:hidden!">
          <Separator orientation="vertical" />
        </div>
      </div>
    )
  }
)
ToolbarGroup.displayName = 'ToolbarGroup'

type TooltipProps<T extends React.ElementType> = {
  tooltip?: React.ReactNode
  tooltipContentProps?: Omit<React.ComponentPropsWithoutRef<typeof TooltipContent>, 'children'>
  tooltipProps?: Omit<React.ComponentPropsWithoutRef<typeof Tooltip>, 'children'>
  tooltipTriggerProps?: React.ComponentPropsWithoutRef<typeof TooltipTrigger>
} & React.ComponentProps<T>

function withTooltip<T extends React.ElementType>(Component: T) {
  const WrappedComponent = React.forwardRef<
    // @ts-ignore
    React.ElementRef<T>,
    TooltipProps<T>
  >(function ExtendComponent(
    { tooltip, tooltipContentProps, tooltipProps, tooltipTriggerProps, ...props },
    ref
  ) {
    const [mounted, setMounted] = React.useState(false)

    React.useEffect(() => {
      setMounted(true)
    }, [])

    const component = React.createElement(Component as any, {
      ref,
      ...(props as React.ComponentProps<T>)
    })

    if (tooltip && mounted) {
      return (
        <Tooltip {...tooltipProps}>
          <TooltipTrigger asChild {...tooltipTriggerProps}>
            {component}
          </TooltipTrigger>

          <TooltipContent {...tooltipContentProps}>{tooltip}</TooltipContent>
        </Tooltip>
      )
    }

    return component
  })

  return WrappedComponent as any
}

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentProps<typeof TooltipPrimitive.Content>
>(({ children, className, sideOffset = 4, ...props }, ref) => {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        ref={ref}
        className={cn(
          'z-50 w-fit origin-(--radix-tooltip-content-transform-origin) rounded-md bg-morphing-900 px-3 py-1.5 text-xs text-balance text-morphing-50',
          className
        )}
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        {...props}
      >
        {children}
        {/* CHANGE */}
        {/* <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-primary fill-primary" /> */}
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
})
TooltipContent.displayName = 'TooltipContent'

export const ToolbarMenuGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuRadioGroup>,
  React.ComponentProps<typeof DropdownMenuRadioGroup> & { label?: string }
>(({ children, className, label, ...props }, ref) => {
  return (
    <>
      <DropdownMenuSeparator
        className={cn(
          'hidden',
          'mb-0 shrink-0 peer-has-[[role=menuitem]]/menu-group:block peer-has-[[role=menuitemradio]]/menu-group:block peer-has-[[role=option]]/menu-group:block'
        )}
      />

      <DropdownMenuRadioGroup
        ref={ref}
        {...props}
        className={cn(
          'hidden',
          'peer/menu-group group/menu-group my-1.5 has-[[role=menuitem]]:block has-[[role=menuitemradio]]:block has-[[role=option]]:block',
          className
        )}
      >
        {label && (
          <DropdownMenuLabel className="text-xs font-semibold text-muted-foreground select-none">
            {label}
          </DropdownMenuLabel>
        )}
        {children}
      </DropdownMenuRadioGroup>
    </>
  )
})
ToolbarMenuGroup.displayName = 'ToolbarMenuGroup'
