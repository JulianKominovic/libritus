import { browserGoBack, browserGoForward } from '@renderer/integrations/webBrowser'
import {
  SEARCH_CAPTURE_LANDSCAPE,
  SEARCH_CAPTURE_PORTRAIT
} from '@renderer/lib/pdf-canvas/pdfSearchCapture'
import { Keys } from '@renderer/lib/keymaps'
import { RectangleHorizontal, RectangleVertical } from 'lucide-react'
import { forwardRef, type Ref } from 'react'

type BrowserChromeProps = {
  zoomPercentRef: Ref<HTMLSpanElement>
  onZoomIn: () => void
  onZoomOut: () => void
  onResizePortrait: () => void
  onResizeLandscape: () => void
}

export const BrowserChrome = forwardRef<HTMLDivElement, BrowserChromeProps>(function BrowserChrome(
  { zoomPercentRef, onZoomIn, onZoomOut, onResizePortrait, onResizeLandscape },
  ref
) {
  return (
    <div
      ref={ref}
      data-browser-chrome
      className="pointer-events-auto absolute z-90 hidden h-11 items-center gap-1 rounded-lg border border-neutral-300 bg-neutral-100 p-1 shadow-lg"
      onPointerDown={(event) => {
        // Keep host from treating this as canvas outside-click; don't steal focus.
        event.stopPropagation()
      }}
    >
      <button
        type="button"
        aria-label="Back"
        className="rounded-md h-full px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-200 -mr-2"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => void browserGoBack()}
      >
        ←
      </button>
      <button
        type="button"
        aria-label="Forward"
        className="rounded-md h-full px-3 text-xs font-medium text-neutral-800 hover:bg-neutral-200"
        onPointerDown={(event) => event.preventDefault()}
        onClick={() => void browserGoForward()}
      >
        →
      </button>
      <div className="mx-0.5 flex items-center gap-0.5 border-l border-neutral-200 pl-1 h-full">
        <button
          type="button"
          aria-label={`Zoom out (${Keys.CONTROL_OR_META}−)`}
          title={`Zoom out (${Keys.CONTROL_OR_META}−)`}
          className="flex items-center rounded-md h-full px-2 leading-none text-neutral-800 hover:bg-neutral-200"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onZoomOut}
        >
          <span className="text-xs text-neutral-500">{Keys.CONTROL_OR_META}−</span>
        </button>
        <span
          ref={zoomPercentRef}
          className="min-w-9 tabular-nums text-center text-xs font-medium text-neutral-800"
        >
          80%
        </span>
        <button
          type="button"
          aria-label={`Zoom in (${Keys.CONTROL_OR_META}+)`}
          title={`Zoom in (${Keys.CONTROL_OR_META}+)`}
          className="flex items-center rounded-md h-full px-2 leading-none text-neutral-800 hover:bg-neutral-200"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onZoomIn}
        >
          <span className="text-xs text-neutral-500">{Keys.CONTROL_OR_META}+</span>
        </button>
      </div>
      <div className="mx-0.5 flex items-center gap-0.5 border-l border-neutral-200 pl-1 h-full">
        <button
          type="button"
          aria-label="Portrait size"
          title={`Portrait (${SEARCH_CAPTURE_PORTRAIT.width}×${SEARCH_CAPTURE_PORTRAIT.height})`}
          className="flex items-center rounded-md h-full px-2 text-neutral-800 hover:bg-neutral-200"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onResizePortrait}
        >
          <RectangleVertical className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          aria-label="Landscape size"
          title={`Landscape (${SEARCH_CAPTURE_LANDSCAPE.width}×${SEARCH_CAPTURE_LANDSCAPE.height})`}
          className="flex items-center rounded-md h-full px-2 text-neutral-800 hover:bg-neutral-200"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onResizeLandscape}
        >
          <RectangleHorizontal className="size-3.5" aria-hidden />
        </button>
      </div>
    </div>
  )
})
