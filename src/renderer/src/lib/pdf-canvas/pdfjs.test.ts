import { describe, expect, test } from 'bun:test'
import { pdfjsWasmUrlFrom } from './pdfjs'

describe('pdfjsWasmUrlFrom', () => {
  test('http(s) uses origin root, not the route path', () => {
    expect(
      pdfjsWasmUrlFrom('http:', 'http://localhost:5173', 'http://localhost:5173/pdf/abc')
    ).toBe('http://localhost:5173/wasm/')
  })

  test('file: resolves next to the document', () => {
    expect(
      pdfjsWasmUrlFrom(
        'file:',
        'null',
        'file:///Applications/Libritus.app/Contents/Resources/app/out/renderer/index.html'
      )
    ).toBe('file:///Applications/Libritus.app/Contents/Resources/app/out/renderer/wasm/')
  })
})
