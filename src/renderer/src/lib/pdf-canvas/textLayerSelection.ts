/**
 * pdf.js TextLayerBuilder selection helpers (Chromium ≥148 / Electron path).
 * Toggles `.selecting` so `.endOfContent` covers blank areas (CSS).
 * Skips the legacy endOfContent DOM-move dance — fixed in Chromium 148+.
 *
 * Experimental: caret snap on whitespace → start/end of nearest line so
 * diagonal drags (including start/end in page margins) include intermediate
 * lines via a normal DOM Range. Focus snaps on the text layer under the
 * cursor (cross-page). Not native PDF / `<p>` parity.
 *
 * ponytail: Electron-only; no Firefox / old-Chrome branches. Snap ceilings —
 * multi-column, DOM order ≠ visual, rotated runs. Upgrade path: own selection
 * engine or page-space ranges.
 */

import { isWhitespaceHit, resolveSnapCaret } from './textLayerCaretSnap'

const textLayers = new Map<HTMLDivElement, HTMLDivElement>()
const layerMouseACs = new WeakMap<HTMLDivElement, AbortController>()
let selectionChangeAC: AbortController | null = null

type SnapDrag = {
  layer: HTMLDivElement
  anchorNode: Node
  anchorOffset: number
  /** Started on margin / .endOfContent — host owns the whole Selection. */
  fromWhitespace: boolean
}

let snapDrag: SnapDrag | null = null

function reset(end: HTMLDivElement, textLayer: HTMLDivElement): void {
  textLayer.append(end)
  textLayer.classList.remove('selecting')
}

function clearSnapDrag(): void {
  snapDrag = null
}

function layerFromTarget(target: Element): HTMLDivElement | null {
  const layer = target.closest('.textLayer')
  if (!(layer instanceof HTMLDivElement) || !textLayers.has(layer)) return null
  return layer
}

function caretAtPoint(
  layer: HTMLDivElement,
  clientX: number,
  clientY: number,
  preferNative: boolean
): { node: Node; offset: number } | null {
  if (preferNative) {
    const doc = layer.ownerDocument
    const range =
      typeof doc.caretRangeFromPoint === 'function'
        ? doc.caretRangeFromPoint(clientX, clientY)
        : null
    if (range && layer.contains(range.startContainer)) {
      return { node: range.startContainer, offset: range.startOffset }
    }
  }
  return resolveSnapCaret(layer, clientX, clientY)
}

function applySnapSelection(drag: SnapDrag, focus: { node: Node; offset: number }): void {
  const selection = document.getSelection()
  if (!selection) return
  try {
    selection.setBaseAndExtent(drag.anchorNode, drag.anchorOffset, focus.node, focus.offset)
  } catch {
    clearSnapDrag()
  }
}

function enableGlobalSelectionListener(): void {
  if (selectionChangeAC) return
  // Assign only after listeners are wired — a throw mid-setup must not poison
  // module state (bun:test mocks / partial document).
  const ac = new AbortController()
  const { signal } = ac

  let isPointerDown = false
  document.addEventListener(
    'pointerdown',
    (event) => {
      isPointerDown = true
      clearSnapDrag()

      if (event.button !== 0) return
      const target = event.target
      if (!(target instanceof Element)) return
      const layer = layerFromTarget(target)
      if (!layer) return

      const whitespace = isWhitespaceHit(target)
      const caret = caretAtPoint(layer, event.clientX, event.clientY, !whitespace)
      if (!caret) return

      layer.classList.add('selecting')
      snapDrag = {
        layer,
        anchorNode: caret.node,
        anchorOffset: caret.offset,
        fromWhitespace: whitespace
      }

      // Native selection never starts on .endOfContent (user-select: none) or
      // empty layer hits — seed a collapsed range so the gesture is real.
      if (whitespace) {
        applySnapSelection(snapDrag, caret)
      }
    },
    { signal }
  )
  document.addEventListener(
    'pointermove',
    (event) => {
      if (!snapDrag) return
      // Missed pointerup / pointercancel must not leave a sticky snap that
      // rewrites Selection on mere hover over .endOfContent.
      if ((event.buttons & 1) === 0) {
        clearSnapDrag()
        return
      }

      const hit =
        event.target instanceof Element
          ? event.target
          : document.elementFromPoint(event.clientX, event.clientY)
      if (!(hit instanceof Element)) return

      const focusLayer = layerFromTarget(hit)
      if (!focusLayer) {
        // Gap between pages / off PDF — do not rewrite Selection.
        return
      }

      const onStartLayer = focusLayer === snapDrag.layer
      const whitespace = isWhitespaceHit(hit)

      // Same page, span-started, over glyphs: leave native Selection alone.
      if (onStartLayer && !snapDrag.fromWhitespace && !whitespace) return

      // Always resolve focus on the layer under the cursor. Using the *start*
      // layer with page-2 coordinates fought native cross-page selection and
      // flickered on whitespace.
      const preferNative = !whitespace
      const focus = caretAtPoint(focusLayer, event.clientX, event.clientY, preferNative)
      if (!focus) return
      focusLayer.classList.add('selecting')
      applySnapSelection(snapDrag, focus)
    },
    { signal }
  )
  document.addEventListener(
    'pointerup',
    () => {
      isPointerDown = false
      clearSnapDrag()
      textLayers.forEach(reset)
    },
    { signal }
  )
  document.addEventListener(
    'pointercancel',
    () => {
      isPointerDown = false
      clearSnapDrag()
      textLayers.forEach(reset)
    },
    { signal }
  )
  window.addEventListener(
    'blur',
    () => {
      isPointerDown = false
      clearSnapDrag()
      textLayers.forEach(reset)
    },
    { signal }
  )
  document.addEventListener(
    'keyup',
    () => {
      if (!isPointerDown) textLayers.forEach(reset)
    },
    { signal }
  )

  document.addEventListener(
    'selectionchange',
    () => {
      const selection = document.getSelection()
      if (!selection || selection.rangeCount === 0) {
        textLayers.forEach(reset)
        return
      }

      const activeTextLayers = new Set<HTMLDivElement>()
      for (let i = 0; i < selection.rangeCount; i++) {
        const range = selection.getRangeAt(i)
        for (const textLayerDiv of textLayers.keys()) {
          if (!activeTextLayers.has(textLayerDiv) && range.intersectsNode(textLayerDiv)) {
            activeTextLayers.add(textLayerDiv)
          }
        }
      }

      for (const [textLayerDiv, endDiv] of textLayers) {
        if (activeTextLayers.has(textLayerDiv)) {
          textLayerDiv.classList.add('selecting')
        } else {
          reset(endDiv, textLayerDiv)
        }
      }
    },
    { signal }
  )

  selectionChangeAC = ac
}

/** Register a ready text layer for selection handling. */
export function registerTextLayerSelection(
  div: HTMLDivElement,
  endOfContent: HTMLDivElement
): void {
  unregisterTextLayerSelection(div)
  const mouseAC = new AbortController()
  layerMouseACs.set(div, mouseAC)
  div.addEventListener(
    'mousedown',
    () => {
      div.classList.add('selecting')
    },
    { signal: mouseAC.signal }
  )
  textLayers.set(div, endOfContent)
  enableGlobalSelectionListener()
}

/** Drop a layer (evict / rebuild / destroy). */
export function unregisterTextLayerSelection(div: HTMLDivElement): void {
  layerMouseACs.get(div)?.abort()
  layerMouseACs.delete(div)
  if (snapDrag?.layer === div) clearSnapDrag()
  textLayers.delete(div)
  if (textLayers.size === 0) {
    selectionChangeAC?.abort()
    selectionChangeAC = null
    clearSnapDrag()
  }
}
