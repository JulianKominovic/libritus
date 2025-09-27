import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SettingsStore = {
  showPdfOutline: boolean
  setShowPdfOutline: (showPdfOutline: boolean) => void
  showNavigationSidebar: boolean
  setShowNavigationSidebar: (showNavigationSidebar: boolean) => void
  lockPdfHorizontalScroll: boolean
  setLockPdfHorizontalScroll: (lockPdfHorizontalScroll: boolean) => void
  appDataDir: string
  pdfResolution: number
  setPdfResolution: (pdfResolution: number) => void
}
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      showPdfOutline: true,
      setShowPdfOutline: (showPdfOutline: boolean) => set({ showPdfOutline }),
      showNavigationSidebar: true,
      setShowNavigationSidebar: (showNavigationSidebar: boolean) => set({ showNavigationSidebar }),
      lockPdfHorizontalScroll: true,
      setLockPdfHorizontalScroll: (lockPdfHorizontalScroll: boolean) =>
        set({ lockPdfHorizontalScroll }),
      appDataDir: '',
      pdfResolution: 1,
      setPdfResolution: (pdfResolution: number) => set({ pdfResolution })
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
