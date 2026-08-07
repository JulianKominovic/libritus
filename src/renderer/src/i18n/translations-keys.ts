import { en } from './en'

/**
 * Union of all translation keys, derived from the English dictionary
 * (source of truth). Adding a key to `en` automatically expands this type,
 * and TypeScript then requires the same key in `es.ts`.
 */
export type TranslationsKeys = keyof typeof en
