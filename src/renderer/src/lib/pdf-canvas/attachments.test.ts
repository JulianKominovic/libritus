import { describe, expect, test } from 'bun:test'
import {
  attachmentCandidatePaths,
  attachmentFilename,
  bytesToDataUrl,
  dataUrlToBytes,
  extToMime,
  fileIdsFromElements,
  mimeToExt
} from './attachments'

describe('mimeToExt / extToMime', () => {
  test('maps common image mimes', () => {
    expect(mimeToExt('image/png')).toBe('png')
    expect(mimeToExt('image/jpeg')).toBe('jpg')
    expect(mimeToExt('image/webp')).toBe('webp')
    expect(mimeToExt('image/svg+xml')).toBe('svg')
  })

  test('unknown mime falls back to bin', () => {
    expect(mimeToExt('application/x-unknown')).toBe('bin')
  })

  test('extToMime round-trips common exts', () => {
    expect(extToMime('png')).toBe('image/png')
    expect(extToMime('jpg')).toBe('image/jpeg')
    expect(extToMime('JPEG')).toBe('image/jpeg')
    expect(extToMime('bin')).toBe('application/octet-stream')
  })
})

describe('attachmentFilename', () => {
  test('puts file under attachments/ with id and ext', () => {
    expect(attachmentFilename('abc-123', 'image/png')).toBe('attachments/abc-123.png')
    expect(attachmentFilename('xyz', 'image/jpeg')).toBe('attachments/xyz.jpg')
  })
})

describe('attachmentCandidatePaths', () => {
  test('lists known extensions for probe-on-load', () => {
    const paths = attachmentCandidatePaths('fid')
    expect(paths[0]).toBe('attachments/fid.png')
    expect(paths.some((p) => p.endsWith('.jpg'))).toBe(true)
    expect(paths.every((p) => p.startsWith('attachments/fid.'))).toBe(true)
  })
})

describe('dataUrl roundtrip', () => {
  test('bytes ↔ dataURL preserves payload', () => {
    const bytes = new Uint8Array([0, 1, 2, 255, 128, 64])
    const dataURL = bytesToDataUrl(bytes, 'image/png')
    expect(dataURL.startsWith('data:image/png;base64,')).toBe(true)
    expect([...dataUrlToBytes(dataURL)]).toEqual([...bytes])
  })
})

describe('fileIdsFromElements', () => {
  test('collects unique non-deleted image fileIds', () => {
    const ids = fileIdsFromElements([
      { type: 'rectangle', id: 'r1' },
      { type: 'image', id: 'i1', fileId: 'f1', isDeleted: false },
      { type: 'image', id: 'i2', fileId: 'f1' },
      { type: 'image', id: 'i3', fileId: 'f2', isDeleted: true },
      { type: 'image', id: 'i4', fileId: '' },
      null,
      'skip'
    ])
    expect(ids).toEqual(['f1'])
  })
})
