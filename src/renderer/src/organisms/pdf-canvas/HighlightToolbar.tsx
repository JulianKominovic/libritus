import {
  HIGHLIGHT_COLORS,
  normalizeHighlightColor
} from '@renderer/lib/pdf-canvas/selectionToHighlights'
import { Trash2 } from 'lucide-react'
import { forwardRef } from 'react'

type HighlightToolbarProps = {
  activeColor: string
  onRecolor: (color: string) => void
  onAddNote: () => void
  onRemove: () => void
}

export const HighlightToolbar = forwardRef<HTMLDivElement, HighlightToolbarProps>(
  function HighlightToolbar({ activeColor, onRecolor, onAddNote, onRemove }, ref) {
    return (
      <div
        ref={ref}
        className="pointer-events-auto absolute z-90 hidden -translate-x-1/2 -translate-y-full items-stretch gap-1 rounded-full border border-neutral-200 bg-white p-1 shadow-lg"
      >
        {HIGHLIGHT_COLORS.map(({ id, color }) => {
          const selected = normalizeHighlightColor(activeColor) === normalizeHighlightColor(color)
          return (
            <button
              key={id}
              type="button"
              aria-label={`Highlight color ${id}`}
              disabled={selected}
              className="size-10 shrink-0 rounded-[50%] transition-transform duration-150 ease-out enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:bg-neutral-200!"
              style={{ backgroundColor: color }}
              onClick={() => onRecolor(color)}
            />
          )
        })}
        <div className="mx-1 w-px shrink-0 self-stretch bg-neutral-200" aria-hidden />
        <button
          type="button"
          className="self-stretch rounded-full px-3 text-xs font-medium text-neutral-900 transition-transform duration-150 ease-out active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-100"
          onClick={onAddNote}
        >
          Add note
        </button>
        <button
          type="button"
          disabled
          className="self-stretch rounded-full px-3 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Buscar
        </button>
        <button
          type="button"
          disabled
          className="self-stretch rounded-full px-3 text-xs font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Traducir
        </button>
        <button
          type="button"
          aria-label="Remove"
          className="flex self-stretch items-center justify-center rounded-full px-3 text-neutral-900 transition-transform duration-150 ease-out active:scale-[0.96] [@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-100"
          onClick={onRemove}
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    )
  }
)
