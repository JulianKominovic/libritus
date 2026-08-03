import { describe, expect, test } from 'bun:test'
import { pdfiumWasmUrlFrom } from './embedpdfEngine'

describe('pdfiumWasmUrlFrom', () => {
  test('http(s) uses origin root (not route base)', () => {
    expect(pdfiumWasmUrlFrom('https:', 'https://app.example', 'https://app.example/pdf/x')).toBe(
      'https://app.example/wasm/pdfium.wasm'
    )
  })

  test('file: resolves next to index.html', () => {
    expect(pdfiumWasmUrlFrom('file:', 'file://', 'file:///Users/me/app/index.html')).toBe(
      'file:///Users/me/app/wasm/pdfium.wasm'
    )
  })
})
