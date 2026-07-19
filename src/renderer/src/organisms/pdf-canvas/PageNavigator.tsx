import { ChevronLeft, ChevronRight } from 'lucide-react'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react'

const chromePress = 'transition-transform duration-150 ease-out active:not-disabled:scale-[0.96]'
const chromeHover = '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-morphing-100'

export type PageNavigatorHandle = {
  /** Update the live 1-based page without re-rendering the parent. */
  setCurrentPage: (page1Based: number) => void
}

export type PageNavigatorProps = {
  pageCount: number
  /** Initial 1-based page (live updates go through the handle). */
  initialPage?: number
  onGoToPage: (page1Based: number) => void
  onPrev: () => void
  onNext: () => void
}

export const PageNavigator = forwardRef<PageNavigatorHandle, PageNavigatorProps>(
  function PageNavigator({ pageCount, initialPage = 1, onGoToPage, onPrev, onNext }, ref) {
    const currentPageRef = useRef(initialPage)
    const editingRef = useRef(false)
    const skipCommitRef = useRef(false)
    const inputRef = useRef<HTMLInputElement>(null)
    const prevBtnRef = useRef<HTMLButtonElement>(null)
    const nextBtnRef = useRef<HTMLButtonElement>(null)

    const syncChrome = useCallback(
      (page: number) => {
        const prev = prevBtnRef.current
        const next = nextBtnRef.current
        const input = inputRef.current
        if (prev) prev.disabled = page <= 1
        if (next) next.disabled = page >= pageCount
        if (input && !editingRef.current) {
          input.value = String(page)
        }
      },
      [pageCount]
    )

    // Disabled state is DOM-driven (avoids React resetting from stale initialPage).
    useEffect(() => {
      syncChrome(currentPageRef.current)
    }, [syncChrome])

    useImperativeHandle(
      ref,
      () => ({
        setCurrentPage(page1Based: number) {
          const clamped = Math.min(pageCount, Math.max(1, page1Based))
          if (clamped === currentPageRef.current) return
          currentPageRef.current = clamped
          syncChrome(clamped)
        }
      }),
      [pageCount, syncChrome]
    )

    const commit = () => {
      const input = inputRef.current
      if (!input) return

      if (skipCommitRef.current) {
        skipCommitRef.current = false
        editingRef.current = false
        input.value = String(currentPageRef.current)
        return
      }

      editingRef.current = false
      const parsed = Number.parseInt(input.value.trim(), 10)
      if (!Number.isFinite(parsed)) {
        input.value = String(currentPageRef.current)
        return
      }
      const clamped = Math.min(pageCount, Math.max(1, parsed))
      input.value = String(clamped)
      if (clamped !== currentPageRef.current) {
        onGoToPage(clamped)
      } else {
        syncChrome(clamped)
      }
    }

    return (
      <div className="pointer-events-auto flex h-10 items-center gap-0.5 rounded-lg bg-white px-1 text-sm font-medium text-morphing-900 shadow-md shadow-morphing-900/10 ring-1 ring-black/10">
        <button
          ref={prevBtnRef}
          type="button"
          aria-label="Previous page"
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-sm text-morphing-700 disabled:cursor-not-allowed disabled:opacity-40 ${chromePress} ${chromeHover}`}
          onClick={onPrev}
        >
          <ChevronLeft className="size-4" aria-hidden />
        </button>
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          aria-label="Current page"
          defaultValue={String(initialPage)}
          className="h-8 w-10 rounded-sm bg-morphing-100 px-1 text-center text-sm tabular-nums text-morphing-900 outline-none ring-0 focus:bg-morphing-50"
          onFocus={() => {
            editingRef.current = true
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              ;(e.target as HTMLInputElement).blur()
            } else if (e.key === 'Escape') {
              e.preventDefault()
              skipCommitRef.current = true
              ;(e.target as HTMLInputElement).blur()
            }
          }}
        />
        <span className="px-0.5 text-morphing-400">/</span>
        <span className="min-w-[1.5rem] px-0.5 tabular-nums text-morphing-500">{pageCount}</span>
        <button
          ref={nextBtnRef}
          type="button"
          aria-label="Next page"
          className={`flex min-h-10 min-w-10 items-center justify-center rounded-sm text-morphing-700 disabled:cursor-not-allowed disabled:opacity-40 ${chromePress} ${chromeHover}`}
          onClick={onNext}
        >
          <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    )
  }
)
