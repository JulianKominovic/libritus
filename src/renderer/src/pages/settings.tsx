import { Button } from '@renderer/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger
} from '@renderer/components/ui/context-menu'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@renderer/components/ui/select'
import { Slider } from '@renderer/components/ui/slider'
import { Switch } from '@renderer/components/ui/switch'
import type { AppLanguage } from '@renderer/i18n/lang-context'
import { useLang } from '@renderer/i18n/lang-context'
import { cn } from '@renderer/lib/utils'
import { useSettings } from '@renderer/stores/settings'
import { DynamicIcon } from 'lucide-react/dynamic'
import { motion } from 'motion/react'
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

const EASE_OUT = [0.23, 1, 0.32, 1] as const

function fadeInUp(order = 0) {
  return {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, delay: order * 0.06, ease: EASE_OUT }
  }
}

// AiSettingsSection (OpenRouter key + chat model) parked with RAG —
// restore from git when redoing AI; see also src/main/ai/index.ts.

function SettingsPage() {
  const showPdfOutline = useSettings((s) => s.showPdfOutline)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  const setShowNavigationSidebar = useSettings((s) => s.setShowNavigationSidebar)
  const pdfResolution = useSettings((s) => s.pdfResolution)
  const setPdfResolution = useSettings((s) => s.setPdfResolution)
  const lang = useSettings((s) => s.lang)
  const setLang = useSettings((s) => s.setLang)
  const { t } = useLang()
  const appDataDir = useSettings((s) => s.appDataDir)
  const settingsFields: Record<'pdf' | 'navigation', SettingsField[]> = {
    pdf: [
      {
        name: t('settings_show_pdf_sidebar'),
        description: t('settings_show_pdf_sidebar_desc'),
        value: showPdfOutline,
        onChange: (value) => setShowPdfOutline(value as boolean),
        type: 'boolean'
      },
      {
        name: t('settings_pdf_resolution'),
        description: t('settings_pdf_resolution_desc'),
        children: (
          <p className="text-sm text-muted-foreground">{t('settings_pdf_resolution_hint')}</p>
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
        name: t('settings_show_nav_sidebar'),
        description: t('settings_show_nav_sidebar_desc'),
        value: showNavigationSidebar,
        onChange: (value) => setShowNavigationSidebar(value as boolean),
        type: 'boolean'
      }
    ]
  }

  const sectionCount = Object.keys(settingsFields).length

  return (
    <div className="w-full max-w-lg select-none">
      <motion.h1
        className="mb-8 font-serif text-4xl font-bold tracking-tighter text-morphing-900"
        {...fadeInUp()}
      >
        {t('settings')}
      </motion.h1>
      <div className="w-full space-y-10">
        <motion.div className="flex flex-col w-full gap-4" {...fadeInUp(1)}>
          <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">
            {t('settings_language')}
          </h2>
          <div
            className={cn(
              settingsFieldClassName,
              'items-center justify-between cursor-pointer hover:bg-morphing-200/60'
            )}
          >
            <p className="font-medium text-morphing-900">{lang === 'es' ? 'Español' : 'English'}</p>
            <Select value={lang} onValueChange={(value) => setLang(value as AppLanguage)}>
              <SelectTrigger className="w-fit min-w-36" aria-label={t('settings_language')}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="es">Español</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.div>
        {Object.entries(settingsFields).map(([key, value], sectionIndex) => (
          <motion.div
            key={key + 'settings-section'}
            className="flex flex-col w-full gap-4"
            {...fadeInUp(sectionIndex + 2)}
          >
            <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">
              {t(key as 'pdf' | 'navigation')}
            </h2>
            {value.map((field) => {
              if (field.type === 'boolean') {
                return (
                  <label
                    key={field.name + 'settings-field'}
                    className={cn(
                      settingsFieldClassName,
                      'items-center justify-between cursor-pointer hover:bg-morphing-200/60'
                    )}
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
                  <div
                    key={field.name + 'settings-field'}
                    className={cn(settingsFieldClassName, 'flex-col items-start')}
                  >
                    <div className="flex w-full items-baseline justify-between gap-3">
                      <p className="font-medium text-morphing-900">{field.name}</p>
                      <p className="text-sm tabular-nums text-muted-foreground">
                        {Number(field.value.toFixed(1))}×
                      </p>
                    </div>
                    <p className="text-sm text-muted-foreground">{field.description}</p>
                    {field.children}
                    <Slider
                      min={field.min}
                      max={field.max}
                      step={field.step}
                      value={[field.value]}
                      onValueChange={(value) => field.onChange(value[0])}
                    />
                  </div>
                )
              }
            })}
          </motion.div>
        ))}

        {/* <AiSettingsSection /> — parked with RAG (src/main/ai/index.ts) */}

        <motion.div className="flex flex-col w-full gap-4" {...fadeInUp(sectionCount + 2)}>
          <h2 className="font-serif text-2xl font-bold tracking-tighter text-morphing-900">
            {t('info')}
          </h2>

          <p className="text-sm text-muted-foreground">{t('settings_local_data_hint')}</p>
          {appDataDir ? (
            <ContextMenu>
              <ContextMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-fit max-w-full font-normal"
                  onClick={() => {
                    window.electron.ipcRenderer.invoke('open-path', { path: appDataDir })
                  }}
                >
                  <DynamicIcon name="folder-open" className="size-4 shrink-0" />
                  <span className="truncate">{appDataDir}</span>
                </Button>
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem
                  onClick={() => {
                    window.electron.ipcRenderer.invoke('open-path', { path: appDataDir })
                  }}
                >
                  <DynamicIcon name="folder-open" />
                  {t('settings_open_folder')}
                </ContextMenuItem>
                <ContextMenuItem
                  onClick={() => {
                    void navigator.clipboard.writeText(appDataDir)
                  }}
                >
                  <DynamicIcon name="copy" />
                  {t('settings_copy_path')}
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ) : null}
        </motion.div>
      </div>
    </div>
  )
}

export default SettingsPage
