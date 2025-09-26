import { centerScrollX } from '@renderer/lib/dom'
import { useSettings } from '@renderer/stores/settings'
import { useEffect } from 'react'

function usePdfScrollXLock(pagesComponentId: string) {
  const lockPdfHorizontalScroll = useSettings((s) => s.lockPdfHorizontalScroll)
  const pagesElement = document.getElementById(pagesComponentId) as HTMLDivElement
  if (lockPdfHorizontalScroll && pagesElement) {
    centerScrollX(pagesElement)
  }
  useEffect(() => {
    if (lockPdfHorizontalScroll && pagesElement) {
      centerScrollX(pagesElement)
    }
  }, [lockPdfHorizontalScroll, pagesElement])

  return {
    lockPdfHorizontalScroll
  }
}

export default usePdfScrollXLock
