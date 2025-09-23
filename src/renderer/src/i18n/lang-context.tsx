import { createContext, useContext, useState } from 'react'
import { en } from './en'
import type { TranslationsKeys } from './translations-keys'

export type LangContextType = {
  lang: 'en' | 'es'
  setLang: (lang: LangContextType['lang']) => void
  t: (key: TranslationsKeys) => React.ReactElement | string
}
export const LangContext = createContext<LangContextType>({
  lang: 'en',
  setLang: () => {},
  t: () => ''
})

export const LangProvider = ({ children }: { children: React.ReactNode }) => {
  const [lang, setLang] = useState<LangContextType['lang']>('en')
  function t(key: TranslationsKeys, args?: Record<string, string>) {
    if (!en[key]) {
      console.warn(`Translation key ${key} not found`)
      return key
    }
    return (en[key] || key).replace(/{(\w+)}/g, (match, p1) => args?.[p1] || match)
  }

  return <LangContext.Provider value={{ lang, setLang, t }}>{children}</LangContext.Provider>
}
export const useLang = () => {
  return useContext(LangContext)
}
