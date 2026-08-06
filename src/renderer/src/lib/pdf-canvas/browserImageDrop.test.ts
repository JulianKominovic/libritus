import { describe, expect, test } from 'bun:test'
import {
  dataTransferLooksLikeBrowserImageDrag,
  dataTransferLooksLikeBrowserUrlOrImageDrag,
  imageUrlFromDataTransfer,
  imageUrlFromHtml,
  imageUrlFromUriList,
  isImageMime
} from './browserImageDrop'

function stubDt(opts: {
  html?: string
  uri?: string
  types?: string[]
  filesLength?: number
}): DataTransfer {
  const html = opts.html ?? ''
  const uri = opts.uri ?? ''
  const types = opts.types ?? [
    ...(html ? (['text/html'] as const) : []),
    ...(uri ? (['text/uri-list'] as const) : [])
  ]
  return {
    types,
    files: { length: opts.filesLength ?? 0 } as FileList,
    getData: (format: string) => {
      if (format === 'text/html') return html
      if (format === 'text/uri-list') return uri
      return ''
    }
  } as unknown as DataTransfer
}

describe('imageUrlFromHtml', () => {
  test('extracts first absolute http(s) img src', () => {
    const html =
      '<meta http-equiv="Content-Type" content="text/html;charset=UTF-8">' +
      '<img class="avatar avatar-user" src="https://avatars.githubusercontent.com/u/70329467?s=80&amp;v=4" width="40" height="40" alt="@Julia">'
    expect(imageUrlFromHtml(html)).toBe('https://avatars.githubusercontent.com/u/70329467?s=80&v=4')
  })

  test('decodes &amp; in src', () => {
    expect(imageUrlFromHtml('<img src="https://cdn.example.com/a.png?a=1&amp;b=2">')).toBe(
      'https://cdn.example.com/a.png?a=1&b=2'
    )
  })

  test('rejects relative and non-http src', () => {
    expect(imageUrlFromHtml('<img src="/relative.png">')).toBeNull()
    expect(imageUrlFromHtml('<img src="file:///tmp/x.png">')).toBeNull()
  })
})

describe('imageUrlFromUriList', () => {
  test('accepts image path extension', () => {
    expect(imageUrlFromUriList('https://cdn.example.com/shot.PNG?x=1')).toBe(
      'https://cdn.example.com/shot.PNG?x=1'
    )
  })

  test('rejects page URLs without image extension', () => {
    expect(imageUrlFromUriList('https://github.com/JulianKominovic')).toBeNull()
  })
})

describe('imageUrlFromDataTransfer', () => {
  test('Chrome avatar drag: prefers img src over page uri-list', () => {
    const url = imageUrlFromDataTransfer(
      stubDt({
        html: '<img class="avatar" src="https://avatars.githubusercontent.com/u/70329467?s=80&amp;v=4">',
        uri: 'https://github.com/JulianKominovic'
      })
    )
    expect(url).toBe('https://avatars.githubusercontent.com/u/70329467?s=80&v=4')
  })

  test('Files present → null (Finder / Excalidraw path)', () => {
    expect(
      imageUrlFromDataTransfer(
        stubDt({
          html: '<img src="https://cdn.example.com/a.png">',
          uri: 'https://cdn.example.com/a.png',
          filesLength: 1
        })
      )
    ).toBeNull()
  })

  test('uri-list image only', () => {
    expect(imageUrlFromDataTransfer(stubDt({ uri: 'https://cdn.example.com/a.webp' }))).toBe(
      'https://cdn.example.com/a.webp'
    )
  })

  test('page uri-list without img → null', () => {
    expect(
      imageUrlFromDataTransfer(stubDt({ uri: 'https://github.com/JulianKominovic' }))
    ).toBeNull()
  })

  test('empty → null', () => {
    expect(imageUrlFromDataTransfer(stubDt({}))).toBeNull()
    expect(imageUrlFromDataTransfer(null)).toBeNull()
  })
})

describe('dataTransferLooksLikeBrowserImageDrag', () => {
  test('html or uri-list without files', () => {
    expect(
      dataTransferLooksLikeBrowserImageDrag(
        stubDt({ types: ['text/html', 'text/uri-list', 'chromium/x-drag-id'] })
      )
    ).toBe(true)
    expect(
      dataTransferLooksLikeBrowserImageDrag(stubDt({ types: ['Files'], filesLength: 1 }))
    ).toBe(false)
  })

  test('text/plain alone is not an image drag', () => {
    expect(dataTransferLooksLikeBrowserImageDrag(stubDt({ types: ['text/plain'] }))).toBe(false)
  })
})

describe('dataTransferLooksLikeBrowserUrlOrImageDrag', () => {
  test('html, uri-list, or plain without files', () => {
    expect(
      dataTransferLooksLikeBrowserUrlOrImageDrag(stubDt({ types: ['text/uri-list'] }))
    ).toBe(true)
    expect(dataTransferLooksLikeBrowserUrlOrImageDrag(stubDt({ types: ['text/plain'] }))).toBe(
      true
    )
    expect(
      dataTransferLooksLikeBrowserUrlOrImageDrag(stubDt({ types: ['Files'], filesLength: 1 }))
    ).toBe(false)
  })
})

describe('isImageMime', () => {
  test('accepts image/* with optional params', () => {
    expect(isImageMime('image/png')).toBe(true)
    expect(isImageMime('image/jpeg; charset=binary')).toBe(true)
    expect(isImageMime('text/html')).toBe(false)
    expect(isImageMime(null)).toBe(false)
  })
})
