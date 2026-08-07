import { createContext, useCallback, useContext, useEffect } from 'react'
import { useSettings } from '@renderer/stores/settings'
import { en } from './en'
import { es } from './es'
import { interpolate } from './translate'
import type { TranslationsKeys } from './translations-keys'

export type AppLanguage = 'en' | 'es'

const DICTIONARIES: Record<AppLanguage, Record<TranslationsKeys, string>> = {
  en,
  es
}

export type LangContextType = {
  lang: AppLanguage
  setLang: (lang: AppLanguage) => void
  t: (key: TranslationsKeys, args?: Record<string, string | number>) => string
}

export const LangContext = createContext<LangContextType>({
  lang: 'en',
  setLang: () => {},
  t: (key) => key
})

export const LangProvider = ({ children }: { children: React.ReactNode }) => {
  const lang = useSettings((s) => s.lang)
  const setLang = useSettings((s) => s.setLang)

  // Keep the main process in sync (guest browser context menu labels).
  useEffect(() => {
    window.electron.ipcRenderer.send('app:set-locale', lang)
  }, [lang])

  const t = useCallback(
    (key: TranslationsKeys, args?: Record<string, string | number>): string => {
      const dict = DICTIONARIES[lang]
      const template = dict[key] || en[key]
      if (!template) {
        console.warn(`Translation key ${key} not found`)
        return key
      }
      return interpolate(template, args)
    },
    [lang]
  )

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}

export const useLang = () => {
  return useContext(LangContext)
}
