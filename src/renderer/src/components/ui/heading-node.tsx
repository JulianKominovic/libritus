'use client'

import type { VariantProps } from 'class-variance-authority'

import type { PlateElementProps } from 'platejs/react'
import { PlateElement } from 'platejs/react'
import { headingVariants } from './heading-node-static'

export function HeadingElement({
  variant = 'h1',
  ...props
}: PlateElementProps & VariantProps<typeof headingVariants>) {
  return (
    <PlateElement as={variant!} className={headingVariants({ variant })} {...props}>
      {props.children}
    </PlateElement>
  )
}

export function H1Element(props: PlateElementProps) {
  return <HeadingElement variant="h1" {...props} />
}

export function H2Element(props: PlateElementProps) {
  return <HeadingElement variant="h2" {...props} />
}

export function H3Element(props: PlateElementProps) {
  return <HeadingElement variant="h3" {...props} />
}

export function H4Element(props: PlateElementProps) {
  return <HeadingElement variant="h4" {...props} />
}

export function H5Element(props: PlateElementProps) {
  return <HeadingElement variant="h5" {...props} />
}

export function H6Element(props: PlateElementProps) {
  return <HeadingElement variant="h6" {...props} />
}
