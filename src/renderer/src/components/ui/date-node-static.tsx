import type { TDateElement } from 'platejs'
import type { SlateElementProps } from 'platejs/static'
import { SlateElement } from 'platejs/static'

import { useLang } from '@renderer/i18n/lang-context'

export function DateElementStatic(props: SlateElementProps<TDateElement>) {
  const { element } = props
  const { t } = useLang()

  return (
    <SlateElement className="inline-block" {...props}>
      <span className="w-fit rounded-sm bg-muted px-1 text-muted-foreground">
        {element.date ? (
          (() => {
            const today = new Date()
            const elementDate = new Date(element.date)
            const isToday =
              elementDate.getDate() === today.getDate() &&
              elementDate.getMonth() === today.getMonth() &&
              elementDate.getFullYear() === today.getFullYear()

            const isYesterday =
              new Date(today.setDate(today.getDate() - 1)).toDateString() ===
              elementDate.toDateString()
            const isTomorrow =
              new Date(today.setDate(today.getDate() + 2)).toDateString() ===
              elementDate.toDateString()

            if (isToday) return t('date_today')
            if (isYesterday) return t('date_yesterday')
            if (isTomorrow) return t('date_tomorrow')

            return elementDate.toLocaleDateString(undefined, {
              day: 'numeric',
              month: 'long',
              year: 'numeric'
            })
          })()
        ) : (
          <span>{t('date_pick')}</span>
        )}
      </span>
      {props.children}
    </SlateElement>
  )
}
