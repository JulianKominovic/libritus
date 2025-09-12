import { create } from "zustand";
import { platform } from "@tauri-apps/plugin-os";

export const PLATFORM = platform();

export type SettingsStore = {
  showPdfOutline: boolean;
  setShowPdfOutline: (showPdfOutline: boolean) => void;
  showNavigationSidebar: boolean;
  setShowNavigationSidebar: (showNavigationSidebar: boolean) => void;
};
export const useSettings = create<SettingsStore>((set) => ({
  showPdfOutline: true,
  setShowPdfOutline: (showPdfOutline: boolean) => set({ showPdfOutline }),
  showNavigationSidebar: true,
  setShowNavigationSidebar: (showNavigationSidebar: boolean) =>
    set({ showNavigationSidebar }),
}));
