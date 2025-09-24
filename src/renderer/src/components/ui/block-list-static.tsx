import { isOrderedList } from '@platejs/list'
import type { RenderStaticNodeWrapper, SlateRenderElementProps, TListElement } from 'platejs'
import type * as React from 'react'

import { cn } from '@renderer/lib/utils'

const config: Record<
  string,
  {
    Li: React.FC<SlateRenderElementProps>
    Marker: React.FC<SlateRenderElementProps>
  }
> = {
  todo: {
    Li: TodoLiStatic,
    Marker: TodoMarkerStatic
  }
}

export const BlockListStatic: RenderStaticNodeWrapper = (props) => {
  if (!props.element.listStyleType) return

  return (props) => <List {...props} />
}

function List(props: SlateRenderElementProps) {
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

function TodoMarkerStatic(props: SlateRenderElementProps) {
  const checked = props.element.checked as boolean

  return (
    <div contentEditable={false}>
      <button
        className={cn(
          'peer pointer-events-none absolute top-1 -left-6 size-5 shrink-0 rounded-[6px] border border-black/20 bg-white/60 ring-offset-background focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none data-[state=checked]:bg-[--current-card-fg] data-[state=checked]:text-[--current-card-bg]',
          props.className
        )}
        data-state={checked ? 'checked' : 'unchecked'}
        type="button"
      >
        <div className={cn('flex items-center justify-center text-current')}>
          {checked && (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="lucide size-3.5"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          )}
        </div>
      </button>
    </div>
  )
}

function TodoLiStatic(props: SlateRenderElementProps) {
  return (
    <li
      className={cn('list-none', (props.element.checked as boolean) && 'opacity-50 line-through')}
    >
      {props.children}
    </li>
  )
}
