'use client'

import { cn } from '@renderer/lib/utils'
import { type VariantProps, cva } from 'class-variance-authority'
import React from 'react'

const buttonGroupVariants = cva('flex sm:items-center max-sm:gap-1 bg-background p-1 rounded-xl', {
  variants: {
    size: {
      default: '[&>*]:h-10 [&>*]:px-4 [&>*]:py-2',
      sm: '[&>*]:h-9 [&>*]:rounded-md [&>*]:px-3',
      lg: '[&>*]:h-11 [&>*]:rounded-md [&>*]:px-8',
      icon: '[&>*]:h-8 [&>*]:w-8'
    },
    separated: {
      true: '[&>*]:outline [&>*]:outline-1 [&>*]:outline-zinc-500 gap-0.5 [&>*:focus-within]:ring-offset-2',
      false: '[&>*:focus-within]:ring-offset-1'
    }
  },
  defaultVariants: {
    separated: false,
    size: 'default'
  }
})

export interface ButtonGroupProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof buttonGroupVariants> {
  separated?: boolean
}

const ButtonGroup = React.forwardRef<HTMLDivElement, ButtonGroupProps>(
  ({ children, className, size, separated = false, ...props }, ref) => {
    return (
      <div className={cn(buttonGroupVariants({ size, className, separated }))} ref={ref} {...props}>
        {children}
      </div>
    )
  }
)
ButtonGroup.displayName = 'ButtonGroup'

function ButtonGroupItem({
  children,
  active = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      {...props}
      data-active={active}
      className={cn(
        'flex items-center justify-center rounded-lg transition-all data-[active=true]:bg-light data-[active=true]:text-primary-foreground data-[active=true]:shadow',
        className
      )}
    >
      {children}
    </button>
  )
}

export { ButtonGroup, ButtonGroupItem }
