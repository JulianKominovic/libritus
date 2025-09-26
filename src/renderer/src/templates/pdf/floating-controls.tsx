import { CurrentPage, CurrentZoom, TotalPages, usePdf, ZoomIn, ZoomOut } from '@anaralabs/lector'
import { Button, buttonVariants } from '@renderer/components/ui/button'
import Shortcut from '@renderer/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@renderer/components/ui/tooltip'
import { Keys } from '@renderer/lib/keymaps'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/stores/settings'
import { DynamicIcon } from 'lucide-react/dynamic'
import { forwardRef, useMemo } from 'react'

function PercentageProgress() {
  const currentPage = usePdf((s) => s.currentPage)
  const numPages = usePdf((state) => state.pdfDocumentProxy.numPages)
  const percentage = useMemo(() => {
    return (currentPage / numPages) * 100
  }, [currentPage, numPages])
  return <div className="text-morphing-700 text-sm tabular-nums">{percentage.toFixed(1)}%</div>
}

const ZoomFitWidth = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement>>(
  (props, ref) => {
    const zoomFitWidth = usePdf((s) => s.zoomFitWidth)
    return (
      <button
        {...props}
        ref={ref}
        className="p-0 size-6 flex items-center justify-center"
        onClick={zoomFitWidth}
      >
        <DynamicIcon name="maximize-2" className="size-4" />
      </button>
    )
  }
)

export default function FloatingControls() {
  const setLockPdfHorizontalScroll = useSettings((s) => s.setLockPdfHorizontalScroll)
  const lockPdfHorizontalScroll = useSettings((s) => s.lockPdfHorizontalScroll)
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
          <ZoomOut
            className={buttonVariants({
              variant: 'none',
              className: '!p-0 !size-6'
            })}
          >
            <TooltipTrigger asChild>
              <div>
                <DynamicIcon name="zoom-out" className="size-4" />
              </div>
            </TooltipTrigger>
          </ZoomOut>
          <TooltipContent>
            Zoom out{' '}
            <Shortcut
              keys={[Keys.CONTROL_OR_META, '-']}
              className="ml-1 border border-white/40 text-white bg-white/20 rounded-sm px-1"
            />
          </TooltipContent>
        </Tooltip>

        <CurrentZoom className="w-8 focus:outline-none tabular-nums" />
        <Tooltip>
          <ZoomIn
            className={buttonVariants({
              variant: 'none',
              className: '!p-0 !size-6'
            })}
          >
            <TooltipTrigger asChild>
              <div>
                <DynamicIcon name="zoom-in" className="size-4" />
              </div>
            </TooltipTrigger>
          </ZoomIn>
          <TooltipContent>
            Zoom in{' '}
            <Shortcut
              keys={[Keys.CONTROL_OR_META, '+']}
              className="ml-1 border border-white/40 text-white bg-white/20 rounded-sm px-1"
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
              className="ml-1 border border-white/40 text-white bg-white/20 rounded-sm px-1"
            />
          </TooltipContent>
        </Tooltip>
      </div>
      <div className="flex gap-2 p-2 bg-morphing-100 border border-morphing-300 shadow-md shadow-morphing-900/20 rounded-full">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={'none'}
              className={cn(
                '!p-0 !size-6 text-morphing-900',
                lockPdfHorizontalScroll ? 'opacity-20' : ''
              )}
              onClick={() => setLockPdfHorizontalScroll(!lockPdfHorizontalScroll)}
            >
              <DynamicIcon name={'move-horizontal'} className="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {lockPdfHorizontalScroll ? 'Allow horizontal scroll' : 'Disable horizontal scroll'}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  )
}
