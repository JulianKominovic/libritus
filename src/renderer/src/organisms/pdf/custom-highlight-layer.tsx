/** biome-ignore-all lint/suspicious/noArrayIndexKey: I know what I'm doing 🔥🚒🧨 */
import { usePDFPageNumber } from '@anaralabs/lector'
import { getHightBaseColor } from '@renderer/lib/highlight-colors'
import { type Pdf } from '@renderer/stores/categories'

function Highlight({
  h,
  r,
  isSelected,
  setSelectedHighlight
}: {
  h: NonNullable<Pdf['highlights']>[0]
  r: NonNullable<Pdf['highlights']>[0]['rects'][0]
  isSelected: boolean
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
}) {
  return (
    <button
      data-highlight-id={h.id}
      type="button"
      className="absolute rounded-sm select-none cursor-pointer opacity-30 hover:opacity-50"
      style={{
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
        backgroundColor: isSelected ? '#595959' : getHightBaseColor(h.color)
      }}
      onClick={() => setSelectedHighlight(isSelected ? null : h)}
    />
  )
}

export default function CustomHighlightLayer({
  highlights,
  setSelectedHighlight,
  selectedHighlight
}: {
  highlights: Pdf['highlights']
  selectedHighlight: NonNullable<Pdf['highlights']>[0] | null
  setSelectedHighlight: (highlight: NonNullable<Pdf['highlights']>[0] | null) => void
  categoryId: string
  pdfId: string
}) {
  const pageNumber = usePDFPageNumber()

  const pageHighlights = highlights?.filter((h) =>
    h.rects.some((re) => re.pageNumber === pageNumber)
  )

  const highlightRects = pageHighlights?.flatMap((h, idx) =>
    h.rects
      .filter((rect) => rect.left > 0 && rect.top > 0 && rect.pageNumber === pageNumber)
      .map((r, i) => {
        const isSelected = h.id === selectedHighlight?.id
        return (
          <Highlight
            key={idx + r.pageNumber + (h?.id ?? '') + i}
            h={h}
            r={r}
            setSelectedHighlight={setSelectedHighlight}
            isSelected={isSelected}
          />
        )
      })
  )

  return <>{highlightRects}</>
}
