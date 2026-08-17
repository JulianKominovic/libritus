import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import { EXCALIDRAW_UI_POINTER_SELECTOR, isExcalidrawUiPointerTarget } from './excalidrawUiTarget'

function makeDom() {
  return new JSDOM('<!doctype html><html><body></body></html>').window.document
}

describe('isExcalidrawUiPointerTarget', () => {
  test('null / non-Element → false', () => {
    expect(isExcalidrawUiPointerTarget(null)).toBe(false)
    expect(isExcalidrawUiPointerTarget({} as EventTarget)).toBe(false)
  })

  test('canvas-like node outside chrome → false', () => {
    const doc = makeDom()
    const canvas = doc.createElement('canvas')
    doc.body.appendChild(canvas)
    expect(isExcalidrawUiPointerTarget(canvas)).toBe(false)
  })

  test('style panel (.layer-ui__wrapper) and descendants → true', () => {
    const doc = makeDom()
    const panel = doc.createElement('div')
    panel.className = 'layer-ui__wrapper'
    const btn = doc.createElement('button')
    btn.textContent = 'Stroke'
    panel.appendChild(btn)
    doc.body.appendChild(panel)
    expect(isExcalidrawUiPointerTarget(panel)).toBe(true)
    expect(isExcalidrawUiPointerTarget(btn)).toBe(true)
  })

  test('context-menu and toast container → true', () => {
    const doc = makeDom()
    const menu = doc.createElement('div')
    menu.className = 'context-menu'
    const toast = doc.createElement('div')
    toast.className = 'excalidraw-toast-container'
    doc.body.append(menu, toast)
    expect(isExcalidrawUiPointerTarget(menu)).toBe(true)
    expect(isExcalidrawUiPointerTarget(toast)).toBe(true)
  })

  test('embeddable under body (not chrome) → false', () => {
    const doc = makeDom()
    const embed = doc.createElement('div')
    embed.className = 'excalidraw__embeddable-container'
    embed.setAttribute('data-pdf-search-capture', '')
    doc.body.appendChild(embed)
    expect(isExcalidrawUiPointerTarget(embed)).toBe(false)
  })

  test('pdf sidebar → true', () => {
    const doc = makeDom()
    const sidebar = doc.createElement('aside')
    sidebar.setAttribute('data-pdf-sidebar', '')
    const row = doc.createElement('button')
    sidebar.appendChild(row)
    doc.body.appendChild(sidebar)
    expect(isExcalidrawUiPointerTarget(row)).toBe(true)
  })

  test('selector covers the chrome classes we rely on', () => {
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('.layer-ui__wrapper')
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('[data-pdf-sidebar]')
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('.context-menu')
  })
})
