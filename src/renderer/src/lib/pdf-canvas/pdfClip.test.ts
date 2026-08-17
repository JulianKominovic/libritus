import { describe, expect, mock, test } from 'bun:test'
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types'

let idSeq = 0

mock.module('@excalidraw/excalidraw', () => ({
  convertToExcalidrawElements: (skeletons: Array<Record<string, unknown>>) =>
    skeletons.map((skel) => {
      const id = (skel.id as string | undefined) ?? `el-${++idSeq}`
      return {
        id,
        type: skel.type,
        x: (skel.x as number) ?? 0,
        y: (skel.y as number) ?? 0,
        width: (skel.width as number) ?? 0,
        height: (skel.height as number) ?? 0,
        angle: 0,
        strokeColor: (skel.strokeColor as string) ?? '#000',
        backgroundColor: (skel.backgroundColor as string) ?? 'transparent',
        fillStyle: (skel.fillStyle as string) ?? 'solid',
        strokeWidth: (skel.strokeWidth as number) ?? 1,
        strokeStyle: 'solid',
        roughness: (skel.roughness as number) ?? 0,
        opacity: 100,
        groupIds: [],
        frameId: null,
        index: null,
        roundness: null,
        seed: 1,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: (skel.link as string | null | undefined) ?? null,
        locked: false,
        customData: skel.customData ?? null
      }
    }),
  newElementWith: (el: Record<string, unknown>, updates: Record<string, unknown>) => ({
    ...el,
    ...updates,
    version: ((el.version as number) ?? 1) + 1
  })
}))

const { createPdfClip, fitCardSize, isPdfClip, normalizePdfClip } = await import('./pdfClip')

describe('fitCardSize', () => {
  test('scales down to fit max box', () => {
    expect(fitCardSize(1200, 800, 480, 720)).toEqual({ width: 480, height: 320 })
  })

  test('does not upscale', () => {
    expect(fitCardSize(100, 50, 480, 720)).toEqual({ width: 100, height: 50 })
  })
})

describe('createPdfClip', () => {
  test('promotes to image with pdfClip customData', () => {
    const el = createPdfClip({
      x: 10,
      y: 20,
      width: 280,
      height: 360,
      pdfFileId: 'pdf-1',
      previewFileId: 'prev-1',
      url: 'https://example.com/a',
      title: 'Article',
      capturedAt: '2026-01-01T00:00:00.000Z'
    })
    expect(isPdfClip(el)).toBe(true)
    expect(el.type).toBe('image')
    expect((el as { fileId?: string }).fileId).toBe('prev-1')
    expect(el.customData?.fileId).toBe('pdf-1')
    expect(el.customData?.previewFileId).toBe('prev-1')
    expect(el.customData?.source).toBe('attachment')
    expect(el.customData?.title).toBe('Article')
  })
})

describe('normalizePdfClip', () => {
  test('no-op for non-clips', () => {
    const el = { id: 'x', type: 'rectangle', customData: null } as unknown as OrderedExcalidrawElement
    expect(normalizePdfClip(el)).toBe(el)
  })

  test('promotes clip without image type', () => {
    const clip = createPdfClip({
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      pdfFileId: 'pdf-2',
      previewFileId: 'prev-2',
      url: '',
      title: ''
    })
    const asRect = { ...clip, type: 'rectangle', fileId: undefined } as unknown as OrderedExcalidrawElement
    const next = normalizePdfClip(asRect)
    expect(next.type).toBe('image')
    expect((next as { fileId?: string }).fileId).toBe('prev-2')
  })
})
