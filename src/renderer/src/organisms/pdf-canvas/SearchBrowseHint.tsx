import { DynamicIcon } from 'lucide-react/dynamic'
import { forwardRef } from 'react'
import { useLang } from '@renderer/i18n/lang-context'

/** Hover / selected cue for promoted search-capture images (no renderEmbeddable). */
export const SearchBrowseHint = forwardRef<HTMLDivElement>(function SearchBrowseHint(_props, ref) {
  const { t } = useLang()
  return (
    <div
      ref={ref}
      className="pointer-events-none absolute z-90 hidden -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs text-neutral-600 shadow-lg shadow-neutral-900/20 ring-1 ring-black/5"
      aria-hidden
      data-search-browse-hint
    >
      <DynamicIcon name="globe" className="size-3.5 shrink-0" />
      {t('search_capture_browse_hint')}
    </div>
  )
})
