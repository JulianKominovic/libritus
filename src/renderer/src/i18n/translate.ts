import type { TranslationsKeys } from './translations-keys'

export function interpolate(template: string, args?: Record<string, string | number>): string {
  if (!args) return template
  return template.replace(/{(\w+)}/g, (match, p1: string) => {
    const value = args[p1]
    return value !== undefined ? String(value) : match
  })
}

export function translate(
  dict: Record<TranslationsKeys, string>,
  key: TranslationsKeys,
  args?: Record<string, string | number>
): string {
  const template = dict[key]
  if (!template) {
    console.warn(`Translation key ${key} not found`)
    return key
  }
  return interpolate(template, args)
}
