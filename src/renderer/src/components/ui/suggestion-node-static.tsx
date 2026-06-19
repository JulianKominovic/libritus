import { BaseSuggestionPlugin } from '@platejs/suggestion'

import type { SlateLeafProps, TSuggestionText } from 'platejs'
import { SlateLeaf } from 'platejs'

import { cn } from '@renderer/lib/utils'

export function SuggestionLeafStatic(props: SlateLeafProps<TSuggestionText>) {
  const { editor, leaf } = props

  const dataList = editor.getApi(BaseSuggestionPlugin).suggestion.dataList(leaf)
  const hasRemove = dataList.some((data) => data.type === 'remove')
  const diffOperation = { type: hasRemove ? 'delete' : 'insert' } as const

  const Component = ({ delete: 'del', insert: 'ins', update: 'span' } as const)[diffOperation.type]

  return (
    <SlateLeaf
      {...props}
      as={Component}
      className={cn(
        'border-b-2 border-b-brand/[.24] bg-brand/[.08] text-brand/80 no-underline transition-colors duration-200',
        hasRemove && 'border-b-morphing-300 bg-morphing-200/25 text-morphing-500 line-through'
      )}
    >
      {props.children}
    </SlateLeaf>
  )
}
