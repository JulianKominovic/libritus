import { Globe } from 'lucide-react'
import { memo } from 'react'

type SearchCaptureEmbedProps = {
  captureId: string
  query: string
}

/** Placeholder until deactivate promotes the shape to a native Excalidraw image. */
export const SearchCaptureEmbed = memo(function SearchCaptureEmbed({
  captureId,
  query
}: SearchCaptureEmbedProps) {
  return (
    <div
      className="relative box-border flex h-full w-full flex-col items-center justify-center gap-3 overflow-hidden bg-morphing-100 p-6 text-center"
      data-pdf-search-capture-id={captureId}
      data-pdf-search-capture
    >
      <Globe className="size-10 text-morphing-400" aria-hidden />
      <p className="text-sm font-medium text-morphing-800">Web search</p>
      {query ? (
        <p className="line-clamp-4 text-xs text-morphing-500">&ldquo;{query}&rdquo;</p>
      ) : null}
      <p className="text-xs text-morphing-400">Click center to browse</p>
    </div>
  )
})
