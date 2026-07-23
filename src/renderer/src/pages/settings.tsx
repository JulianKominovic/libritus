import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { useLang } from '@renderer/i18n/lang-context'
import { TranslationsKeys } from '@renderer/i18n/translations-keys'
import {
  clearOpenRouterKey,
  hasOpenRouterKey,
  setOpenRouterKey,
  testOpenRouter
} from '@renderer/lib/ai/ipc'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/stores/settings'
import React, { useEffect, useState } from 'react'

type SettingsField =
  | {
      name: string
      description: string
      value: boolean
      onChange: (value: boolean) => void
      type: 'boolean'
      children?: React.ReactNode
    }
  | {
      name: string
      description: string
      value: number
      onChange: (value: number) => void
      type: 'range'
      min: number
      max: number
      step: number
      children?: React.ReactNode
    }

const settingsFieldClassName =
  'flex w-full gap-3 rounded-xl border border-morphing-300 bg-morphing-100 p-3 select-none transition-colors duration-200'

function AiSettingsSection() {
  const chatModel = useSettings((s) => s.openRouterChatModel)
  const setChatModel = useSettings((s) => s.setOpenRouterChatModel)
  const [keyInput, setKeyInput] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  useEffect(() => {
    void hasOpenRouterKey().then(setHasKey)
  }, [])

  const saveKey = async () => {
    if (!keyInput.trim()) return
    setBusy(true)
    setStatus(null)
    try {
      await setOpenRouterKey(keyInput)
      setKeyInput('')
      setHasKey(true)
      setStatus('Key saved securely.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to save key')
    } finally {
      setBusy(false)
    }
  }

  const clearKey = async () => {
    setBusy(true)
    setStatus(null)
    try {
      await clearOpenRouterKey()
      setHasKey(false)
      setStatus('Key removed.')
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to clear key')
    } finally {
      setBusy(false)
    }
  }

  const testKey = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const result = await testOpenRouter()
      setStatus(result.ok ? 'Connection OK.' : result.error)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col w-full gap-4">
      <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">AI</h2>

      <div className={cn(settingsFieldClassName, 'flex-col items-start')}>
        <p className="font-medium text-morphing-900">OpenRouter API key</p>
        <p className="text-sm text-muted-foreground">
          Bring your own key for chat. Stored encrypted with the OS keychain (never in localStorage).
        </p>
        <p className="text-sm text-muted-foreground">
          Status:{' '}
          <span className="tabular-nums text-morphing-900">
            {hasKey ? 'Key saved' : 'Not configured'}
          </span>
        </p>
        <Input
          type="password"
          autoComplete="off"
          placeholder={hasKey ? '•••••••• (enter to replace)' : 'sk-or-…'}
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          className="w-full"
        />
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" disabled={busy || !keyInput.trim()} onClick={() => void saveKey()}>
            Save key
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy || !hasKey}
            onClick={() => void testKey()}
          >
            Test
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy || !hasKey}
            onClick={() => void clearKey()}
          >
            Clear
          </Button>
        </div>
        {status ? <p className="text-sm text-muted-foreground">{status}</p> : null}
      </div>

      <div className={cn(settingsFieldClassName, 'flex-col items-start')}>
        <p className="font-medium text-morphing-900">Chat model</p>
        <p className="text-sm text-muted-foreground">
          OpenRouter model id for RAG answers (e.g. openai/gpt-4o-mini). Embeddings run locally
          (MiniLM) — no API cost.
        </p>
        <Input
          type="text"
          autoComplete="off"
          spellCheck={false}
          placeholder="openai/gpt-4o-mini"
          value={chatModel}
          onChange={(e) => setChatModel(e.target.value)}
          onBlur={() => setChatModel(chatModel.trim())}
          className="w-full font-mono text-sm"
        />
      </div>
    </div>
  )
}

function SettingsPage() {
  const showPdfOutline = useSettings((s) => s.showPdfOutline)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  const setShowNavigationSidebar = useSettings((s) => s.setShowNavigationSidebar)
  const pdfResolution = useSettings((s) => s.pdfResolution)
  const setPdfResolution = useSettings((s) => s.setPdfResolution)
  const { t } = useLang()
  const appDataDir = useSettings((s) => s.appDataDir)
  const settingsFields: Record<string, SettingsField[]> = {
    pdf: [
      {
        name: 'Show PDF sidebar',
        description: 'Show the PDF right sidebar while reading',
        value: showPdfOutline,
        onChange: (value) => setShowPdfOutline(value as boolean),
        type: 'boolean'
      },
      {
        name: 'PDF Resolution',
        description: 'Control the sharpness and quality of the PDF rendering.',
        children: (
          <p className="text-sm text-destructive">
            Be careful, higher values means more memory usage, GPU and CPU usage.
          </p>
        ),
        value: pdfResolution,
        onChange: (value) => setPdfResolution(value as number),
        type: 'range',
        min: 1,
        max: 3,
        step: 0.1
      }
    ],
    navigation: [
      {
        name: 'Show Navigation Sidebar',
        description: 'Show the navigation sidebar',
        value: showNavigationSidebar,
        onChange: (value) => setShowNavigationSidebar(value as boolean),
        type: 'boolean'
      }
    ]
  }

  return (
    <div className="w-full max-w-lg select-none">
      <h1 className="mb-8 font-serif text-4xl font-bold tracking-tighter text-morphing-900">
        Settings
      </h1>
      <div className="w-full space-y-10">
        {Object.entries(settingsFields).map(([key, value]) => (
          <div key={key + 'settings-section'} className="flex flex-col w-full gap-4">
            <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">
              {t(key as TranslationsKeys)}
            </h2>
            {value.map((field) => {
              if (field.type === 'boolean') {
                return (
                  <label
                    key={field.name + 'settings-field'}
                    className={cn(settingsFieldClassName, 'items-center justify-between')}
                  >
                    <div>
                      <p className="font-medium text-morphing-900">{field.name}</p>
                      <p className="text-sm text-muted-foreground">{field.description}</p>
                      {field.children}
                    </div>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )
              }
              if (field.type === 'range') {
                return (
                  <hgroup
                    key={field.name + 'settings-field'}
                    className={cn(settingsFieldClassName, 'flex-col items-start')}
                  >
                    <p className="font-medium text-morphing-900">{field.name}</p>
                    <p className="text-sm text-muted-foreground">{field.description}</p>
                    {field.children}
                    <Slider
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                    <p className="text-sm tabular-nums text-muted-foreground">{field.value}</p>
                  </hgroup>
                )
              }
            })}
          </div>
        ))}

        <AiSettingsSection />

        <div className="flex flex-col w-full gap-4">
          <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">About</h2>

          <p className="text-sm text-muted-foreground">
            All the data is stored locally in your PC{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-morphing-900"
              onClick={() => {
                window.electron.ipcRenderer.invoke('open-path', { path: appDataDir })
              }}
            >
              {appDataDir}
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}

export default SettingsPage
