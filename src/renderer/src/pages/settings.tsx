import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import { useLang } from '@renderer/i18n/lang-context'
import { TranslationsKeys } from '@renderer/i18n/translations-keys'
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

function SettingsPage() {
  const showPdfOutline = useSettings((s) => s.showPdfOutline)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  const setShowNavigationSidebar = useSettings((s) => s.setShowNavigationSidebar)
  const lockPdfHorizontalScroll = useSettings((s) => s.lockPdfHorizontalScroll)
  const setLockPdfHorizontalScroll = useSettings((s) => s.setLockPdfHorizontalScroll)
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
        name: 'Allow horizontal scroll',
        description: 'Allow or disable the PDF horizontal scroll',
        value: lockPdfHorizontalScroll,
        onChange: (value) => setLockPdfHorizontalScroll(value as boolean),
        type: 'boolean'
      },
      {
        name: 'PDF Resolution',
        description: 'Control the sharpness and quality of the PDF rendering.',
        children: (
          <p className="text-sm text-orange-700">
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
    <div className="w-full max-w-lg px-8 select-none">
      <h1 className="mb-8 font-serif text-4xl font-bold tracking-tighter text-neutral-900">
        Settings
      </h1>
      <div className="w-full space-y-16">
        {Object.entries(settingsFields).map(([key, value]) => (
          <div key={key + 'settings-section'} className="flex flex-col w-full gap-4">
            <h2 className="text-2xl font-bold text-neutral-900">{t(key as TranslationsKeys)}</h2>
            {value.map((field) => {
              if (field.type === 'boolean') {
                return (
                  <label
                    key={field.name + 'settings-field'}
                    className="flex items-center justify-between w-full gap-2 p-2 border rounded-md select-none border-neutral-300 bg-neutral-200"
                  >
                    <div>
                      <p className="font-medium text-neutral-900">{field.name}</p>
                      <p className="text-sm text-neutral-600">{field.description}</p>
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
                    className="flex flex-col items-start justify-between w-full gap-2 p-2 border rounded-md select-none border-neutral-300 bg-neutral-200"
                  >
                    <p className="font-medium text-neutral-900">{field.name}</p>
                    <p className="text-sm text-neutral-600">{field.description}</p>
                    {field.children}
                    <Slider
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                    <p className="text-sm text-neutral-600">{field.value}</p>
                  </hgroup>
                )
              }
            })}
          </div>
        ))}
        <div className="flex flex-col w-full gap-4">
          <h2 className="text-2xl font-bold text-neutral-900">About</h2>

          <p className="text-sm text-neutral-600">
            All the data is stored locally in your PC{' '}
            <a
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
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
