import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { useLang } from '@renderer/i18n/lang-context'
import { TranslationsKeys } from '@renderer/i18n/translations-keys'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/stores/settings'
import React from 'react'

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

// AiSettingsSection (OpenRouter key + chat model) parked with RAG —
// restore from git when redoing AI; see also src/main/ai/index.ts.

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

        {/* <AiSettingsSection /> — parked with RAG (src/main/ai/index.ts) */}

        <div className="flex flex-col w-full gap-4">
          <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">
            About
          </h2>

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
