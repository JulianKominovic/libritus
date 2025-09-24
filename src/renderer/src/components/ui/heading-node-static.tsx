import { type VariantProps, cva } from 'class-variance-authority'

import type { SlateElementProps } from 'platejs'
import { SlateElement } from 'platejs'
import type * as React from 'react'

export const headingVariants = cva('relative mb-1', {
  variants: {
    variant: {
      h1: 'font-serif mt-[1.4em] pb-1 font-heading text-2xl font-bold',
      h2: 'font-serif mt-[1.2em] pb-px font-heading text-xl font-semibold tracking-tight',
      h3: 'font-serif mt-[0.75em] pb-px font-heading text-lg font-semibold tracking-tight',
      h4: 'font-serif mt-[0.75em] font-heading text-base font-semibold tracking-tight',
      h5: 'font-serif mt-[0.75em] text-base font-semibold tracking-tight',
      h6: 'font-serif mt-[0.75em] text-sm font-semibold tracking-tight'
    }
  }
})

export function HeadingElementStatic({
  variant = 'h1',
  ...props
}: SlateElementProps & VariantProps<typeof headingVariants>) {
  return (
    <SlateElement as={variant!} className={headingVariants({ variant })} {...props}>
      {props.children}
    </SlateElement>
  )
}

export function H1ElementStatic(props: SlateElementProps) {
  return <HeadingElementStatic variant="h1" {...props} />
}

export function H2ElementStatic(props: React.ComponentProps<typeof HeadingElementStatic>) {
  return <HeadingElementStatic variant="h2" {...props} />
}

export function H3ElementStatic(props: React.ComponentProps<typeof HeadingElementStatic>) {
  return <HeadingElementStatic variant="h3" {...props} />
}

export function H4ElementStatic(props: React.ComponentProps<typeof HeadingElementStatic>) {
  return <HeadingElementStatic variant="h4" {...props} />
}

export function H5ElementStatic(props: React.ComponentProps<typeof HeadingElementStatic>) {
  return <HeadingElementStatic variant="h5" {...props} />
}

export function H6ElementStatic(props: React.ComponentProps<typeof HeadingElementStatic>) {
  return <HeadingElementStatic variant="h6" {...props} />
}
