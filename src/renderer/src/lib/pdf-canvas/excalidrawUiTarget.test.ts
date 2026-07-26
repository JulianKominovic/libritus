import { describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'
import {
  EXCALIDRAW_UI_POINTER_SELECTOR,
  isExcalidrawUiPointerTarget
} from './excalidrawUiTarget'

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

  test('browser chrome → true', () => {
    const doc = makeDom()
    const chrome = doc.createElement('div')
    chrome.setAttribute('data-browser-chrome', '')
    const zoom = doc.createElement('button')
    chrome.appendChild(zoom)
    doc.body.appendChild(chrome)
    expect(isExcalidrawUiPointerTarget(zoom)).toBe(true)
  })

  test('embeddable under body (not chrome) → false', () => {
    const doc = makeDom()
    const embed = doc.createElement('div')
    embed.className = 'excalidraw__embeddable-container'
    embed.setAttribute('data-pdf-search-capture', '')
    doc.body.appendChild(embed)
    expect(isExcalidrawUiPointerTarget(embed)).toBe(false)
  })

  test('selector covers the chrome classes we rely on', () => {
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('.layer-ui__wrapper')
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('[data-browser-chrome]')
    expect(EXCALIDRAW_UI_POINTER_SELECTOR).toContain('.context-menu')
  })
})
