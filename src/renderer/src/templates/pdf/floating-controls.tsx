import { CurrentPage, CurrentZoom, TotalPages, usePdf, ZoomIn, ZoomOut } from '@anaralabs/lector'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useMemo } from 'react'
import { buttonVariants } from '@/components/ui/button'
import Shortcut from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Keys } from '@/lib/keymaps'

function PercentageProgress() {
  const currentPage = usePdf((s) => s.currentPage)
  const numPages = usePdf((state) => state.pdfDocumentProxy.numPages)
  const percentage = useMemo(() => {
    return (currentPage / numPages) * 100
  }, [currentPage, numPages])
  return <div className="text-morphing-700 text-sm tabular-nums">{percentage.toFixed(1)}%</div>
}

function ZoomFitWidth(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const zoomFitWidth = usePdf((s) => s.zoomFitWidth)
  return (
    <button
      {...props}
      className="p-0 size-6 flex items-center justify-center"
      onClick={zoomFitWidth}
    >
      <DynamicIcon name="maximize-2" className="size-4" />
    </button>
  )
}
export default function FloatingControls() {
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center gap-2">
      <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
        <PercentageProgress />
      </div>
      <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
        <CurrentPage className="text-end w-fit focus:outline-none tabular-nums" />{' '}
        <span className="text-morphing-700">of</span> <TotalPages />
      </div>
      <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <ZoomOut
              className={buttonVariants({
                variant: 'none',
                className: '!p-0 !size-6'
              })}
            >
              <DynamicIcon name="zoom-out" className="size-4" />
            </ZoomOut>
          </TooltipTrigger>
          <TooltipContent>
            Zoom out{' '}
            <Shortcut
              keys={[Keys.CONTROL_OR_META, '-']}
              className="ml-1 border border-white rounded-sm px-1"
            />
          </TooltipContent>
        </Tooltip>

        <CurrentZoom className="w-8 focus:outline-none tabular-nums" />
        <Tooltip>
          <TooltipTrigger asChild>
            <ZoomIn
              className={buttonVariants({
                variant: 'none',
                className: '!p-0 !size-6'
              })}
            >
              <DynamicIcon name="zoom-in" className="size-4" />
            </ZoomIn>
          </TooltipTrigger>
          <TooltipContent>
            Zoom in{' '}
            <Shortcut
              keys={[Keys.CONTROL_OR_META, '+']}
              className="ml-1 border border-white rounded-sm px-1"
            />
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <ZoomFitWidth />
          </TooltipTrigger>
          <TooltipContent>
            Zoom to fit width{' '}
            <Shortcut
              keys={[Keys.CONTROL_OR_META, '0']}
              className="ml-1 border border-white rounded-sm px-1"
            />
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
