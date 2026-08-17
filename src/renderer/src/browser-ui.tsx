import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { en } from '@renderer/i18n/en'
import { es } from '@renderer/i18n/es'
import { translate } from '@renderer/i18n/translate'
import type { TranslationsKeys } from '@renderer/i18n/translations-keys'
import { resetGlobalTheme } from '@renderer/lib/app-theme'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import './App.css'

type NavState = { url?: string; canGoBack?: boolean; canGoForward?: boolean }
type TargetState = {
  captureId: string | null
  thumbnailDataUrl?: string | null
  title?: string | null
}

const ipc = window.electron.ipcRenderer
const isActions = new URLSearchParams(window.location.search).get('panel') === 'actions'
if (isActions) document.documentElement.classList.add('browser-actions')

function useBrowserLang() {
  const [lang, setLang] = useState<'en' | 'es'>('en')
  const t = useCallback((key: TranslationsKeys) => translate(lang === 'es' ? es : en, key), [lang])
  useEffect(() => {
    resetGlobalTheme()
    void ipc.invoke('app:get-locale').then((value: unknown) => {
      if (value === 'en' || value === 'es') setLang(value)
    })
  }, [])
  return t
}

function BrowserNav() {
  const t = useBrowserLang()
  const urlRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)

  const isMac = window.electron.process.platform === 'darwin'

  useEffect(() => {
    const offNav = ipc.on('browser-ui:nav', (_e: unknown, state: NavState) => {
      if (typeof state.url === 'string' && document.activeElement !== urlRef.current) {
        setUrl(state.url)
      }
      setCanGoBack(state.canGoBack === true)
      setCanGoForward(state.canGoForward === true)
    })
    const offFocus = ipc.on('browser-ui:focus-url', () => {
      urlRef.current?.focus()
      urlRef.current?.select()
    })
    return () => {
      offNav()
      offFocus()
    }
  }, [])

  return (
    <nav
      className={
        isMac
          ? 'w-full h-12.5 flex items-center gap-2 px-4 pl-22 window-nav fixed inset-x-0 top-0 z-50 bg-linear-to-b from-neutral-100/80 to-transparent'
          : 'w-full h-12.5 flex items-center gap-2 px-4 pr-36 window-nav fixed inset-x-0 top-0 z-50 bg-linear-to-b from-neutral-100/80 to-transparent'
      }
    >
      <Button
        variant="ghost"
        className="text-neutral-600"
        aria-label={t('browser_back_aria')}
        disabled={!canGoBack}
        onClick={() => void ipc.invoke('browser:goBack')}
      >
        <DynamicIcon name="arrow-left" />
      </Button>
      <Button
        variant="ghost"
        className="-ml-2 -mr-1 text-neutral-600"
        aria-label={t('browser_forward_aria')}
        disabled={!canGoForward}
        onClick={() => void ipc.invoke('browser:goForward')}
      >
        <DynamicIcon name="arrow-right" />
      </Button>
      <Input
        ref={urlRef}
        value={url}
        spellCheck={false}
        autoComplete="off"
        aria-label={t('browser_url_placeholder')}
        placeholder={t('browser_url_placeholder')}
        className="h-8 max-w-64 bg-neutral-50"
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          event.preventDefault()
          void ipc.invoke('browser:navigate', url)
        }}
      />
    </nav>
  )
}

function BrowserActions() {
  const t = useBrowserLang()
  const dockRef = useRef<HTMLDivElement>(null)
  const [target, setTarget] = useState<TargetState | null>(null)
  const [capturing, setCapturing] = useState(false)
  const [updating, setUpdating] = useState(false)
  const [savingPdf, setSavingPdf] = useState(false)

  const hasTarget = Boolean(target?.captureId)
  const thumb = target?.thumbnailDataUrl

  useEffect(() => {
    let alive = true
    let pushed = false
    const offTarget = ipc.on('browser-ui:target', (_e: unknown, state: TargetState | null) => {
      pushed = true
      if (alive) setTarget(state ?? null)
    })
    void ipc
      .invoke('browser:getCaptureTarget')
      .then((state: TargetState | { captureId?: unknown } | null) => {
        if (!alive || pushed) return
        if (state && typeof state.captureId === 'string') setTarget(state as TargetState)
        else setTarget(null)
      })
    return () => {
      alive = false
      offTarget()
    }
  }, [])

  useEffect(() => {
    const el = dockRef.current
    if (!el) return
    const report = () => {
      const r = el.getBoundingClientRect()
      void ipc.invoke('browser:setActionsSize', {
        width: Math.ceil(r.width),
        height: Math.ceil(r.height)
      })
    }
    const ro = new ResizeObserver(report)
    ro.observe(el)
    report()
    return () => ro.disconnect()
  }, [hasTarget])

  return (
    <div
      ref={dockRef}
      className="flex w-max items-center gap-1 border border-neutral-300 rounded-full bg-neutral-100 p-1.5"
    >
      {hasTarget && (
        <>
          <div
            className="flex size-10 items-center justify-center overflow-hidden rounded-full bg-neutral-100 outline outline-black/10"
            title={t('browser_updating_capture')}
          >
            {typeof thumb === 'string' && thumb.startsWith('data:') ? (
              <img src={thumb} alt="" className="size-full object-cover" />
            ) : (
              <DynamicIcon name="globe" className="size-3.5 text-neutral-500" />
            )}
          </div>
          <Button
            variant="ghost"
            className="h-10 min-h-10 rounded-full px-3 text-neutral-600 active:scale-[0.96]"
            disabled={updating}
            onClick={async () => {
              setUpdating(true)
              try {
                await ipc.invoke('browser:updateNow')
              } finally {
                setUpdating(false)
              }
            }}
          >
            {t('browser_replace_capture')}
          </Button>
        </>
      )}
      <Button
        variant="ghost"
        className="h-10 min-h-10 rounded-full px-3 text-neutral-600 active:scale-[0.96]"
        disabled={capturing}
        onClick={async () => {
          setCapturing(true)
          try {
            await ipc.invoke('browser:captureNow')
          } finally {
            setCapturing(false)
          }
        }}
      >
        {t('browser_capture')}
      </Button>
      <Button
        variant="ghost"
        className="h-10 min-h-10 rounded-full px-3 text-neutral-600 active:scale-[0.96]"
        disabled={savingPdf}
        onClick={async () => {
          setSavingPdf(true)
          try {
            await ipc.invoke('browser:savePdfNow')
          } finally {
            setSavingPdf(false)
          }
        }}
      >
        {t('browser_save_pdf')}
      </Button>
    </div>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  isActions ? <BrowserActions /> : <BrowserNav />
)
