'use client'

import { useMediaState } from '@platejs/media/react'
import { ResizableProvider } from '@platejs/resizable'
import { DynamicIcon } from 'lucide-react/dynamic'
import type { TFileElement } from 'platejs'
import type { PlateElementProps } from 'platejs/react'
import { PlateElement, useReadOnly, withHOC } from 'platejs/react'

import { useLang } from '@renderer/i18n/lang-context'

import { Caption, CaptionTextarea } from './caption'

export const FileElement = withHOC(
  ResizableProvider,
  function FileElement(props: PlateElementProps<TFileElement>) {
    const readOnly = useReadOnly()
    const { t } = useLang()
    const { name, unsafeUrl } = useMediaState()

    return (
      <PlateElement className="my-px rounded-sm" {...props}>
        <a
          className="group relative m-0 flex cursor-pointer items-center rounded px-0.5 py-[3px] hover:bg-muted"
          contentEditable={false}
          download={name}
          href={unsafeUrl}
          rel="noopener noreferrer"
          role="button"
          target="_blank"
        >
          <div className="flex items-center gap-1 p-1">
            <DynamicIcon name="file-up" className="size-5" />
            <div>{name}</div>
          </div>

          <Caption align="left">
            <CaptionTextarea
              className="text-left"
              readOnly={readOnly}
              placeholder={t('media_caption_placeholder')}
            />
          </Caption>
        </a>
        {props.children}
      </PlateElement>
    )
  }
)
