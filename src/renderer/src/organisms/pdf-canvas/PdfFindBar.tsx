import { ChevronDown, ChevronUp, X } from 'lucide-react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { useLang } from '@renderer/i18n/lang-context'

const chromePress = 'transition-transform duration-150 ease-out active:not-disabled:scale-[0.99]'
const chromeHover = '[@media(hover:hover)_and_(pointer:fine)]:hover:bg-neutral-200'

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

export const PdfFindBar = forwardRef<PdfFindBarHandle, PdfFindBarProps>(function PdfFindBar(
  { onQueryChange, onNext, onPrev, onClose },
  ref
) {
  const { t } = useLang()
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
        const clamped = total === 0 ? 0 : Math.min(total, Math.max(1, current1Based))
        syncChrome(clamped, total)
      },
      focus() {
        inputRef.current?.focus()
        inputRef.current?.select()
      }
    }),
    []
  )

  useEffect(() => {
    syncChrome(0, 0)
    inputRef.current?.focus()
  }, [])

  return (
    <div className="flex h-full items-center gap-0.5 text-sm font-medium text-neutral-900">
      <input
        ref={inputRef}
        type="search"
        aria-label={t('findbar_search_aria')}
        placeholder={t('findbar_placeholder')}
        className="h-[calc(100%-4px)] w-36 rounded-lg bg-neutral-200 px-2 text-sm text-neutral-900 outline-none ring-0 placeholder:text-neutral-400"
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
        className="min-w-[2.5rem] px-0.5 text-center text-sm tabular-nums text-neutral-500"
        aria-live="polite"
      >
        0/0
      </span>
      <button
        ref={prevBtnRef}
        type="button"
        aria-label={t('findbar_prev_aria')}
        className={`flex h-full w-8 items-center justify-center rounded-lg text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 ${chromePress} ${chromeHover}`}
        onClick={onPrev}
      >
        <ChevronUp className="size-4" aria-hidden />
      </button>
      <button
        ref={nextBtnRef}
        type="button"
        aria-label={t('findbar_next_aria')}
        className={`flex h-full w-8 items-center justify-center rounded-lg text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 ${chromePress} ${chromeHover}`}
        onClick={onNext}
      >
        <ChevronDown className="size-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t('findbar_close_aria')}
        className={`flex h-full w-8 items-center justify-center rounded-lg text-neutral-500 ${chromePress} ${chromeHover} [@media(hover:hover)_and_(pointer:fine)]:hover:text-neutral-900`}
        onClick={onClose}
      >
        <X className="size-4" aria-hidden />
      </button>
    </div>
  )
})
