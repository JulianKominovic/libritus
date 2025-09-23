import { Switch } from '@/components/ui/switch'
import { useLang } from '@/i18n/lang-context'
import { TranslationsKeys } from '@/i18n/translations-keys'
import { useSettings } from '@/stores/settings'

function SettingsPage() {
  const showPdfOutline = useSettings((s) => s.showPdfOutline)
  const setShowPdfOutline = useSettings((s) => s.setShowPdfOutline)
  const showNavigationSidebar = useSettings((s) => s.showNavigationSidebar)
  const setShowNavigationSidebar = useSettings((s) => s.setShowNavigationSidebar)
  const { t } = useLang()

  const settingsFields: Record<
    string,
    {
      name: string
      description: string
      value: boolean
      onChange: (value: boolean) => void
    }[]
  > = {
    pdf: [
      {
        name: 'Show PDF sidebar',
        description: 'Show the PDF right sidebar while reading',
        value: showPdfOutline,
        onChange: setShowPdfOutline
      }
    ],
    navigation: [
      {
        name: 'Show Navigation Sidebar',
        description: 'Show the navigation sidebar',
        value: showNavigationSidebar,
        onChange: setShowNavigationSidebar
      }
    ]
  }

  return (
    <div className="px-8 max-w-lg w-full select-none">
      <h1 className="text-4xl font-bold font-serif text-morphing-900 mb-8">Settings</h1>
      <div className="space-y-16 w-full">
        {Object.entries(settingsFields).map(([key, value]) => (
          <div key={key + 'settings-section'} className="flex flex-col gap-4 w-full">
            <h2 className="text-2xl font-bold text-morphing-900">{t(key as TranslationsKeys)}</h2>
            {value.map((field) => {
              if (typeof field.value === 'boolean') {
                return (
                  <label className="flex gap-2 justify-between items-center border rounded-md p-2 border-morphing-300 bg-morphing-100 select-none w-full">
                    <div>
                      <p className="text-morphing-900 font-medium">{field.name}</p>
                      <p className="text-morphing-600 text-sm">{field.description}</p>
                    </div>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </label>
                )
              }
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

export default SettingsPage
