import { DynamicIcon } from 'lucide-react/dynamic'
import { memo } from 'react'
import { useLang } from '@renderer/i18n/lang-context'
import { EmbedActivateHint } from './EmbedActivateHint'

type SearchCaptureEmbedProps = {
  captureId: string
  query: string
}

/** Placeholder until deactivate promotes the shape to a native Excalidraw image. */
export const SearchCaptureEmbed = memo(function SearchCaptureEmbed({
  captureId,
  query
}: SearchCaptureEmbedProps) {
  const { t } = useLang()
  return (
    <div
      className="relative box-border flex h-full w-full cursor-move flex-col items-center justify-center gap-3 overflow-hidden bg-morphing-100 p-6 text-center"
      data-pdf-search-capture-id={captureId}
      data-pdf-search-capture
    >
      <DynamicIcon name="globe" className="size-10 text-morphing-400" aria-hidden />
      <p className="text-sm font-medium text-morphing-800">{t('search_capture_title')}</p>
      {query ? (
        <p className="line-clamp-4 text-xs text-morphing-500">&ldquo;{query}&rdquo;</p>
      ) : null}
      <EmbedActivateHint label={t('search_capture_activate_hint')} icon="globe" />
    </div>
  )
})
