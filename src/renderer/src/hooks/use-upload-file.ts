import * as React from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

async function uploadFile(
  file: File,
  onProgress?: (progress: number) => void
): Promise<ClientUploadedFileData> {
  const searchParams = new URLSearchParams()
  const id = crypto.randomUUID()
  searchParams.set('name', encodeURIComponent(file.name))
  searchParams.set('id', id)

  const res = await new Promise<Response>((resolve, reject) => {
    const xhr = new XMLHttpRequest()

    xhr.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable && onProgress) {
        const progress = (event.loaded / event.total) * 100
        onProgress(progress)
      }
    })

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(
          new Response(xhr.response, {
            status: xhr.status,
            statusText: xhr.statusText
          })
        )
      } else {
        reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`))
      }
    })

    xhr.addEventListener('error', () => {
      reject(new Error('Network error'))
    })

    xhr.open('POST', `/api/v1/upload-file?${searchParams.toString()}`)
    xhr.setRequestHeader('Content-Type', file.type)
    xhr.withCredentials = true

    xhr.send(file)
  })
  const resData = await res.json()
  const data = {
    name: file.name,
    size: file.size,
    type: file.type,
    customId: id as string,
    fileHash: '',
    lastModified: file.lastModified,
    key: id as string,
    serverData: {},
    url: resData.url,
    appUrl: resData.url,
    ufsUrl: resData.url
  }
  return data
}

export type ClientUploadedFileData = {
  name: string
  size: number
  type: string
  customId: string
  fileHash: string
  lastModified: number
  key: string
  serverData: any
  url: string
  appUrl: string
  ufsUrl: string
}

type UseUploadFileProps = {
  onUploadBegin?: () => void
  onUploadProgress?: (progress: number) => void
  onUploadComplete?: (file: ClientUploadedFileData) => void
  onUploadError?: (error: unknown) => void
}
export function useUploadFile({
  onUploadComplete,
  onUploadError,
  onUploadBegin,
  onUploadProgress
}: UseUploadFileProps = {}) {
  const [uploadedFile, setUploadedFile] = React.useState<ClientUploadedFileData | undefined>()
  const [uploadingFile, setUploadingFile] = React.useState<File>()
  const [progress, setProgress] = React.useState<number>(0)
  const [isUploading, setIsUploading] = React.useState(false)

  async function uploadThing(file: File) {
    setIsUploading(true)
    setUploadingFile(file)

    try {
      onUploadBegin?.()
      const uploaded = await uploadFile(file, (p) => {
        setProgress(Math.min(p, 100))
        onUploadProgress?.(p)
      })
      setUploadedFile(uploaded)
      onUploadComplete?.(uploaded)

      return uploaded
    } catch (error) {
      const errorMessage = getErrorMessage(error)

      const message =
        errorMessage.length > 0 ? errorMessage : 'Something went wrong, please try again later.'

      toast.error(message)

      onUploadError?.(error)
    } finally {
      setProgress(0)
      setIsUploading(false)
      setUploadingFile(undefined)
    }
  }

  return {
    isUploading,
    progress,
    uploadedFile,
    uploadFile: uploadThing,
    uploadingFile
  }
}

export function getErrorMessage(err: unknown) {
  const unknownError = 'Something went wrong, please try again later.'

  if (err instanceof z.ZodError) {
    const errors = err.issues.map((issue) => {
      return issue.message
    })

    return errors.join('\n')
  } else if (err instanceof Error) {
    return err.message
  } else {
    return unknownError
  }
}

export function showErrorToast(err: unknown) {
  const errorMessage = getErrorMessage(err)

  return toast.error(errorMessage)
}
