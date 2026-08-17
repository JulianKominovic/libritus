/**
 * Minimal locale support for the Electron main process.
 * Only strings shown by the main process (guest browser context menu, save
 * dialog filters) live here; the renderer owns the authoritative language via
 * the `app:set-locale` IPC channel.
 */

export type MainLocale = 'en' | 'es'

type MenuKey =
  | 'back'
  | 'forward'
  | 'reload'
  | 'copy'
  | 'openLink'
  | 'copyLink'
  | 'copyImage'
  | 'copyImageAddress'
  | 'saveImageAs'
  | 'cut'
  | 'paste'
  | 'selectAll'
  | 'openInSystemBrowser'
  | 'imagesFilter'

const MESSAGES: Record<MainLocale, Record<MenuKey, string>> = {
  en: {
    back: 'Back',
    forward: 'Forward',
    reload: 'Reload',
    copy: 'Copy',
    openLink: 'Open Link',
    copyLink: 'Copy Link',
    copyImage: 'Copy Image',
    copyImageAddress: 'Copy Image Address',
    saveImageAs: 'Save Image As…',
    cut: 'Cut',
    paste: 'Paste',
    selectAll: 'Select All',
    openInSystemBrowser: 'Open in System Browser',
    imagesFilter: 'Images'
  },
  es: {
    back: 'Atrás',
    forward: 'Adelante',
    reload: 'Recargar',
    copy: 'Copiar',
    openLink: 'Abrir enlace',
    copyLink: 'Copiar enlace',
    copyImage: 'Copiar imagen',
    copyImageAddress: 'Copiar dirección de la imagen',
    saveImageAs: 'Guardar imagen como…',
    cut: 'Cortar',
    paste: 'Pegar',
    selectAll: 'Seleccionar todo',
    openInSystemBrowser: 'Abrir en el navegador del sistema',
    imagesFilter: 'Imágenes'
  }
}

let currentLocale: MainLocale = 'en'

export function setMainLocale(locale: MainLocale): void {
  currentLocale = locale === 'es' ? 'es' : 'en'
}

export function getMainLocale(): MainLocale {
  return currentLocale
}

export function tMenu(key: MenuKey): string {
  return MESSAGES[currentLocale][key]
}
