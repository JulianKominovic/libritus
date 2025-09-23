import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type SettingsStore = {
  showPdfOutline: boolean
  setShowPdfOutline: (showPdfOutline: boolean) => void
  showNavigationSidebar: boolean
  setShowNavigationSidebar: (showNavigationSidebar: boolean) => void
}
export const useSettings = create<SettingsStore>()(
  persist(
    (set) => ({
      showPdfOutline: true,
      setShowPdfOutline: (showPdfOutline: boolean) => set({ showPdfOutline }),
      showNavigationSidebar: true,
      setShowNavigationSidebar: (showNavigationSidebar: boolean) => set({ showNavigationSidebar })
    }),
    {
      name: 'settings',
      storage: createJSONStorage(() => localStorage)
    }
  )
)
