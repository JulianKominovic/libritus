import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { AppLanguage } from '@renderer/i18n/lang-context'

/** Default cheap OpenRouter chat model (non-secret preference). */
export const DEFAULT_OPENROUTER_CHAT_MODEL = 'openai/gpt-4o-mini'

export type PdfSidebarTab = 'outline' | 'pages' | 'annotations'

function detectInitialLanguage(): AppLanguage {
  try {
    return navigator.language.toLowerCase().startsWith('es') ? 'es' : 'en'
  } catch {
    return 'en'
  }
}

export type SettingsStore = {
  lang: AppLanguage
  setLang: (lang: AppLanguage) => void
  showPdfOutline: boolean
  setShowPdfOutline: (showPdfOutline: boolean) => void
  pdfSidebarTab: PdfSidebarTab
  setPdfSidebarTab: (pdfSidebarTab: PdfSidebarTab) => void
  showNavigationSidebar: boolean
  setShowNavigationSidebar: (showNavigationSidebar: boolean) => void
  appDataDir: string
  pdfResolution: number
  setPdfResolution: (pdfResolution: number) => void
  openRouterChatModel: string
  setOpenRouterChatModel: (model: string) => void
}
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      lang: detectInitialLanguage(),
      setLang: (lang: AppLanguage) => set({ lang }),
      showPdfOutline: true,
      setShowPdfOutline: (showPdfOutline: boolean) => set({ showPdfOutline }),
      pdfSidebarTab: 'outline',
      setPdfSidebarTab: (pdfSidebarTab: PdfSidebarTab) => set({ pdfSidebarTab }),
      showNavigationSidebar: true,
      setShowNavigationSidebar: (showNavigationSidebar: boolean) => set({ showNavigationSidebar }),
      appDataDir: '',
      pdfResolution: 1,
      setPdfResolution: (pdfResolution: number) => set({ pdfResolution }),
      openRouterChatModel: DEFAULT_OPENROUTER_CHAT_MODEL,
      setOpenRouterChatModel: (openRouterChatModel: string) => set({ openRouterChatModel })
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)

window.electron.ipcRenderer.invoke('get-app-data-dir').then((location) => {
  useSettings.setState({
    appDataDir: location
  })
})
