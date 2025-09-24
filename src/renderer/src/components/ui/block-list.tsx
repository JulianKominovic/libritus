'use client'

import { isOrderedList } from '@platejs/list'
import { useTodoListElement, useTodoListElementState } from '@platejs/list/react'
import type { TListElement } from 'platejs'
import { type PlateElementProps, type RenderNodeWrapper, useReadOnly } from 'platejs/react'
import type React from 'react'

import { Checkbox } from '@renderer/components//ui/checkbox'
import { cn } from '@renderer/lib/utils'

const config: Record<
  string,
  {
    Li: React.FC<PlateElementProps>
    Marker: React.FC<PlateElementProps>
  }
> = {
  todo: {
    Li: TodoLi,
    Marker: TodoMarker
  }
}

export const BlockList: RenderNodeWrapper = (props) => {
  if (!props.element.listStyleType) return

  return (props) => <List {...props} />
}

function List(props: PlateElementProps) {
  const { listStart, listStyleType } = props.element as TListElement
  const { Li, Marker } = config[listStyleType] ?? {}
  const List = isOrderedList(props.element) ? 'ol' : 'ul'
  return (
    <List className="relative m-0 p-0" style={{ listStyleType }} start={listStart}>
      {Marker && <Marker {...props} />}
      {Li ? <Li {...props} /> : <li>{props.children}</li>}
    </List>
  )
}

function TodoMarker(props: PlateElementProps) {
  const state = useTodoListElementState({ element: props.element })
  const { checkboxProps } = useTodoListElement(state)
  const readOnly = useReadOnly()

  return (
    <div contentEditable={false}>
      <Checkbox
        className={cn(
          'absolute top-1 -left-6',
          readOnly && 'pointer-events-none',
          'size-5 shrink-0 rounded-[6px] border border-black/20 bg-white/60 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none data-[state=checked]:bg-[--current-card-fg] data-[state=checked]:text-[--current-card-bg] data-[state=checked]:border-black/20'
        )}
        {...checkboxProps}
      />
    </div>
  )
}

function TodoLi(props: PlateElementProps) {
  return (
    <li
      className={cn('list-none', (props.element.checked as boolean) && 'opacity-50 line-through')}
    >
      {props.children}
    </li>
  )
}
