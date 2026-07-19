import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { forwardRef } from 'react'

import { cn } from '@renderer/lib/utils'

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-medium transition-[transform,background-color,color,box-shadow,border-color] duration-200 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-morphing-200 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 aria-invalid:border-destructive cursor-pointer select-none active:scale-[0.96]",
  {
    variants: {
      variant: {
        default: 'bg-morphing-900 text-morphing-50 hover:bg-morphing-900/90',
        destructive:
          'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20',
        outline:
          'border border-morphing-300 bg-transparent hover:bg-morphing-100 hover:text-morphing-900',
        secondary: 'bg-morphing-50 text-morphing-900 hover:bg-morphing-100',
        ghost: 'hover:bg-morphing-100 hover:text-morphing-900',
        link: 'text-morphing-900 underline-offset-4 hover:underline',
        none: 'bg-transparent font-normal text-morphing-900'
      },
      size: {
        default: 'h-9 px-4 py-2 has-[>svg]:px-3',
        sm: 'h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5',
        lg: 'h-10 rounded-md px-6 has-[>svg]:px-4',
        icon: 'size-9 aspect-square',
        'icon-lg': 'size-10 aspect-square'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

const Button = forwardRef<
  HTMLButtonElement,
  React.ComponentProps<'button'> &
    VariantProps<typeof buttonVariants> & {
      asChild?: boolean
    }
>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      ref={ref}
      {...props}
    />
  )
})
Button.displayName = 'Button'

export { Button, buttonVariants }
