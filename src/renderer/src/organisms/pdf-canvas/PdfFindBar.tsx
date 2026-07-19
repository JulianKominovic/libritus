import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from 'react'

export type PdfFindBarHandle = {
  /** 1-based current index; total 0 means no hits. */
  setMatchInfo: (current1Based: number, total: number) => void
  focus: () => void
}

export type PdfFindBarProps = {
  onQueryChange: (query: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}

export const PdfFindBar = forwardRef<PdfFindBarHandle, PdfFindBarProps>(
  function PdfFindBar({ onQueryChange, onNext, onPrev, onClose }, ref) {
    const inputRef = useRef<HTMLInputElement>(null)
    const countRef = useRef<HTMLSpanElement>(null)
    const prevBtnRef = useRef<HTMLButtonElement>(null)
    const nextBtnRef = useRef<HTMLButtonElement>(null)
    const currentRef = useRef(0)
    const totalRef = useRef(0)

    const syncChrome = (current: number, total: number) => {
      currentRef.current = current
      totalRef.current = total
      const count = countRef.current
      if (count) {
        count.textContent = total === 0 ? '0/0' : `${current}/${total}`
      }
      const prev = prevBtnRef.current
      const next = nextBtnRef.current
      const disabled = total === 0
      if (prev) prev.disabled = disabled
      if (next) next.disabled = disabled
    }

    useImperativeHandle(
      ref,
      () => ({
        setMatchInfo(current1Based, total) {
          const clamped =
            total === 0 ? 0 : Math.min(total, Math.max(1, current1Based))
          syncChrome(clamped, total)
        },
        focus() {
          inputRef.current?.focus()
          inputRef.current?.select()
        },
      }),
      []
    )

    useEffect(() => {
      syncChrome(0, 0)
      inputRef.current?.focus()
    }, [])

    return (
      <div className="pointer-events-auto flex items-center gap-1 rounded-md bg-neutral-900 px-1.5 py-1 text-sm font-medium text-white shadow">
        <input
          ref={inputRef}
          type="search"
          aria-label="Search PDF"
          placeholder="Find…"
          className="w-36 rounded bg-neutral-800 px-1.5 py-0.5 text-sm text-white outline-none ring-0 placeholder:text-neutral-500 focus:bg-neutral-700"
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              onClose()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              if (e.shiftKey) onPrev()
              else onNext()
              return
            }
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              onNext()
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              onPrev()
            }
          }}
        />
        <span
          ref={countRef}
          className="min-w-[2.5rem] px-0.5 text-center text-neutral-300 tabular-nums"
          aria-live="polite"
        >
          0/0
        </span>
        <button
          ref={prevBtnRef}
          type="button"
          aria-label="Previous match"
          className="rounded px-1.5 py-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onPrev}
        >
          ▲
        </button>
        <button
          ref={nextBtnRef}
          type="button"
          aria-label="Next match"
          className="rounded px-1.5 py-0.5 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
          onClick={onNext}
        >
          ▼
        </button>
        <button
          type="button"
          aria-label="Close find"
          className="rounded px-1.5 py-0.5 text-neutral-400 hover:bg-neutral-800 hover:text-white"
          onClick={onClose}
        >
          ✕
        </button>
      </div>
    )
  }
)
