import { Button } from '@renderer/components/ui/button'
import { Input } from '@renderer/components/ui/input'
import { useLang } from '@renderer/i18n/lang-context'
import type { TranslationsKeys } from '@renderer/i18n/translations-keys'
import { downloadUrlAsPdf } from '@renderer/integrations/ipc'
import { usePdfs } from '@renderer/stores/categories'
import { DynamicIcon } from 'lucide-react/dynamic'
import { useState } from 'react'

type UrlToPdfStatus = 'idle' | 'downloading' | 'error' | 'success'

const STATUS_ICON = {
  idle: 'download',
  downloading: 'loader-circle',
  success: 'check',
  error: 'x'
} as const

const STATUS_ARIA: Record<UrlToPdfStatus, TranslationsKeys> = {
  idle: 'category_download_url_aria',
  downloading: 'category_download_url_downloading_aria',
  success: 'category_download_url_success_aria',
  error: 'category_download_url_error_aria'
}

function isHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

export function UrlToPdfForm({ categoryId }: { categoryId: string }) {
  const { t } = useLang()
  const uploadPdf = usePdfs((p) => p.uploadPdf)
  const [pageUrl, setPageUrl] = useState('')
  const [status, setStatus] = useState<UrlToPdfStatus>('idle')

  return (
    <form
      className="flex w-full items-center gap-1"
      onSubmit={async (e) => {
        e.preventDefault()
        const url = pageUrl.trim()
        if (!isHttpUrl(url)) {
          setStatus('error')
          return
        }
        setStatus('downloading')
        try {
          const pdf = await downloadUrlAsPdf(url)
          if (!pdf) {
            setStatus('error')
            return
          }
          const title = pdf.title?.trim() || 'page'
          await uploadPdf(
            categoryId,
            new File([pdf.buffer], `${title}.pdf`, {
              type: 'application/pdf',
              lastModified: Date.now()
            }),
            { name: title }
          )
          setStatus('success')
        } catch {
          setStatus('error')
        }
      }}
    >
      <Input
        type="url"
        value={pageUrl}
        onChange={(e) => {
          setPageUrl(e.target.value)
          if (status !== 'idle') setStatus('idle')
        }}
        placeholder={t('category_url_placeholder')}
        aria-invalid={status === 'error'}
        disabled={status === 'downloading'}
        className="min-w-0 flex-1"
      />
      <Button
        type="submit"
        size="icon"
        variant="outline"
        disabled={status === 'downloading'}
        aria-label={t(STATUS_ARIA[status])}
      >
        <DynamicIcon
          name={STATUS_ICON[status]}
          className={status === 'downloading' ? 'size-4 animate-spin' : 'size-4'}
        />
      </Button>
    </form>
  )
}
