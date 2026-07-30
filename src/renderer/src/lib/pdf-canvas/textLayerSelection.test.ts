import { afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { JSDOM } from 'jsdom'

type SelApi = {
  registerTextLayerSelection: (div: HTMLDivElement, end: HTMLDivElement) => void
  unregisterTextLayerSelection: (div: HTMLDivElement) => void
}

let win: Window & typeof globalThis
let doc: Document
let api: SelApi

function rect(x: number, y: number, w: number, h: number): DOMRect {
  return {
    x,
    y,
    width: w,
    height: h,
    left: x,
    top: y,
    right: x + w,
    bottom: y + h,
    toJSON() {
      return {}
    }
  } as DOMRect
}

function mountLayer(spanBox = { x: 100, y: 50, w: 80, h: 16 }) {
  const layer = doc.createElement('div')
  layer.className = 'textLayer'
  const span = doc.createElement('span')
  span.textContent = 'Libritus'
  span.getBoundingClientRect = () => rect(spanBox.x, spanBox.y, spanBox.w, spanBox.h)
  const end = doc.createElement('div')
  end.className = 'endOfContent'
  layer.append(span, end)
  doc.body.append(layer)
  api.registerTextLayerSelection(layer, end)
  return { layer, span, end, spanBox }
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  target: Element,
  opts: { x: number; y: number; buttons?: number; button?: number }
) {
  const event = new win.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: opts.x,
    clientY: opts.y,
    button: opts.button ?? 0,
    buttons: opts.buttons ?? (type === 'pointerup' || type === 'pointercancel' ? 0 : 1),
    pointerId: 1,
    pointerType: 'mouse'
  })
  target.dispatchEvent(event)
}

beforeAll(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
    url: 'https://libritus.test/'
  })
  win = dom.window as unknown as Window & typeof globalThis
  doc = win.document
  // JSDOM realm: AbortSignal + instanceof Element/HTMLDivElement must match.
  Object.defineProperty(globalThis, 'window', { value: win, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: doc, configurable: true })
  Object.defineProperty(globalThis, 'AbortController', {
    value: win.AbortController,
    configurable: true
  })
  Object.defineProperty(globalThis, 'Node', { value: win.Node, configurable: true })
  Object.defineProperty(globalThis, 'Element', { value: win.Element, configurable: true })
  Object.defineProperty(globalThis, 'HTMLElement', {
    value: win.HTMLElement,
    configurable: true
  })
  Object.defineProperty(globalThis, 'HTMLDivElement', {
    value: win.HTMLDivElement,
    configurable: true
  })
  api = (await import('./textLayerSelection')) as SelApi
})

afterEach(() => {
  for (const layer of [...doc.querySelectorAll('.textLayer')]) {
    api.unregisterTextLayerSelection(layer as HTMLDivElement)
  }
  doc.body.replaceChildren()
  win.getSelection()?.removeAllRanges()
})

describe('textLayerSelection', () => {
  test('mousedown adds selecting; pointerup resets', () => {
    const { layer, end } = mountLayer()
    layer.dispatchEvent(new win.MouseEvent('mousedown', { bubbles: true }))
    expect(layer.classList.contains('selecting')).toBe(true)

    pointer('pointerup', doc.body, { x: 0, y: 0, buttons: 0 })
    expect(layer.classList.contains('selecting')).toBe(false)
    expect(end.parentElement).toBe(layer)
  })

  test('whitespace pointerdown seeds collapsed caret at line start', () => {
    const { layer, span, end, spanBox } = mountLayer()
    const midY = spanBox.y + spanBox.h / 2

    pointer('pointerdown', end, { x: spanBox.x - 40, y: midY })

    expect(layer.classList.contains('selecting')).toBe(true)
    const sel = doc.getSelection()
    expect(sel).toBeTruthy()
    expect(sel!.isCollapsed).toBe(true)
    expect(sel!.anchorOffset).toBe(0)
    expect(span.contains(sel!.anchorNode!)).toBe(true)
  })

  test('whitespace drag snaps focus to line end', () => {
    const { span, end, spanBox } = mountLayer()
    const midY = spanBox.y + spanBox.h / 2

    pointer('pointerdown', end, { x: spanBox.x - 40, y: midY })
    pointer('pointermove', end, {
      x: spanBox.x + spanBox.w + 40,
      y: midY,
      buttons: 1
    })

    const sel = doc.getSelection()
    expect(sel?.toString()).toBe('Libritus')
    expect(span.contains(sel!.focusNode!)).toBe(true)
    expect(sel!.focusOffset).toBe('Libritus'.length)
  })

  test('pointermove with buttons=0 clears snap (no sticky rewrite)', () => {
    const { end, spanBox } = mountLayer()
    const midY = spanBox.y + spanBox.h / 2

    pointer('pointerdown', end, { x: spanBox.x - 40, y: midY })
    expect(doc.getSelection()?.isCollapsed).toBe(true)

    pointer('pointermove', end, { x: spanBox.x + 10, y: midY, buttons: 0 })
    pointer('pointermove', end, {
      x: spanBox.x + spanBox.w + 40,
      y: midY,
      buttons: 1
    })

    // Snap was cleared on buttons=0; hover with buttons=1 must not rewrite Selection.
    expect(doc.getSelection()?.isCollapsed).toBe(true)
    expect(doc.getSelection()?.toString()).toBe('')
  })

  test('unregister last layer tears down global listeners', () => {
    const { layer, end, spanBox } = mountLayer()
    api.unregisterTextLayerSelection(layer)

    const midY = spanBox.y + spanBox.h / 2
    pointer('pointerdown', end, { x: spanBox.x - 40, y: midY })
    expect(doc.getSelection()?.toString() ?? '').toBe('')
    expect(layer.classList.contains('selecting')).toBe(false)
  })
})
