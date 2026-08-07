'use client'

import { PlaceholderPlugin, UploadErrorCode } from '@platejs/media/react'
import { usePluginOption } from 'platejs/react'
import * as React from 'react'
import { toast } from 'sonner'

import { useLang } from '@renderer/i18n/lang-context'

export function MediaUploadToast() {
  useUploadErrorToast()

  return null
}

const useUploadErrorToast = () => {
  const uploadError = usePluginOption(PlaceholderPlugin, 'error')
  const { t } = useLang()
  const tRef = React.useRef(t)
  tRef.current = t

  React.useEffect(() => {
    if (!uploadError) return

    const { code, data } = uploadError

    switch (code) {
      case UploadErrorCode.INVALID_FILE_SIZE: {
        const names = data.files.map((f) => f.name).join(', ')
        toast.error(tRef.current('upload_error_invalid_size', { names }))

        break
      }
      case UploadErrorCode.INVALID_FILE_TYPE: {
        const names = data.files.map((f) => f.name).join(', ')
        toast.error(tRef.current('upload_error_invalid_type', { names }))

        break
      }
      case UploadErrorCode.TOO_LARGE: {
        const names = data.files.map((f) => f.name).join(', ')
        toast.error(tRef.current('upload_error_too_large', { names, max: data.maxFileSize }))

        break
      }
      case UploadErrorCode.TOO_LESS_FILES: {
        toast.error(
          tRef.current('upload_error_too_few', {
            min: data.minFileCount,
            names: data.fileType ?? ''
          })
        )

        break
      }
      case UploadErrorCode.TOO_MANY_FILES: {
        toast.error(
          tRef.current('upload_error_too_many', {
            max: data.maxFileCount,
            names: data.fileType ?? ''
          })
        )

        break
      }
    }
  }, [uploadError])
}
