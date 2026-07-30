/**
 * Experimental caret snap for pdf.js text layers (absolute spans).
 *
 * When the pointer is over whitespace (`.endOfContent` / empty layer), or a
 * drag *starts* there, snap Selection carets to the start/end of the nearest
 * visual line so multi-line margin→margin drags include intermediate lines.
 * Focus uses the text layer under the cursor (cross-page safe).
 *
 * ponytail: heuristic — ceilings: multi-column / DOM order ≠ visual / rotated
 * runs / cross-page. Upgrade path: own selection engine or page-space ranges.
 */

export type SnapBox = {
  left: number
  top: number
  right: number
  bottom: number
}

export type CaretEdge = 'start' | 'end'

export type LineCaretTarget = {
  /** Index into the LTR-sorted line span list. */
  index: number
  edge: CaretEdge
}

function boxHeight(box: SnapBox): number {
  return box.bottom - box.top
}

function sameLine(a: SnapBox, b: SnapBox): boolean {
  const aMid = (a.top + a.bottom) / 2
  const bMid = (b.top + b.bottom) / 2
  const tolerance = Math.min(boxHeight(a), boxHeight(b)) * 0.5
  return Math.abs(aMid - bMid) <= tolerance
}

/** Group spans into visual lines (top→bottom, LTR within line). */
export function groupSpansIntoLines<T extends SnapBox>(spans: T[]): T[][] {
  const sorted = [...spans].sort((a, b) => a.top - b.top || a.left - b.left)
  const lines: T[][] = []
  for (const span of sorted) {
    const last = lines[lines.length - 1]
    if (last && sameLine(last[0]!, span)) {
      last.push(span)
    } else {
      lines.push([span])
    }
  }
  for (const line of lines) {
    line.sort((a, b) => a.left - b.left)
  }
  return lines
}

/**
 * Spans on the visual line whose vertical mid is closest to `clientY`.
 * Returns LTR-sorted spans, or null if empty input.
 */
export function lineBandForY<T extends SnapBox>(spans: T[], clientY: number): T[] | null {
  const lines = groupSpansIntoLines(spans)
  if (lines.length === 0) return null

  let best = lines[0]!
  let bestDist = Infinity
  for (const line of lines) {
    let top = Infinity
    let bottom = -Infinity
    for (const s of line) {
      if (s.top < top) top = s.top
      if (s.bottom > bottom) bottom = s.bottom
    }
    const mid = (top + bottom) / 2
    const dist = Math.abs(mid - clientY)
    if (dist < bestDist) {
      bestDist = dist
      best = line
    }
  }
  return best
}

/**
 * Which span edge to place the caret on for a horizontal whitespace hit.
 * `lineSpans` must be LTR-sorted (as from `lineBandForY`).
 */
export function caretTargetForX(lineSpans: SnapBox[], clientX: number): LineCaretTarget | null {
  if (lineSpans.length === 0) return null

  const first = lineSpans[0]!
  const last = lineSpans[lineSpans.length - 1]!
  if (clientX <= first.left) return { index: 0, edge: 'start' }
  if (clientX >= last.right) return { index: lineSpans.length - 1, edge: 'end' }

  let bestIndex = 0
  let bestEdge: CaretEdge = 'start'
  let bestDist = Infinity
  for (let i = 0; i < lineSpans.length; i++) {
    const s = lineSpans[i]!
    const dL = Math.abs(clientX - s.left)
    const dR = Math.abs(clientX - s.right)
    if (dL < bestDist) {
      bestDist = dL
      bestIndex = i
      bestEdge = 'start'
    }
    if (dR < bestDist) {
      bestDist = dR
      bestIndex = i
      bestEdge = 'end'
    }
  }
  return { index: bestIndex, edge: bestEdge }
}

type ClosestEl = {
  classList: { contains: (token: string) => boolean }
  closest: (selectors: string) => ClosestEl | null
  textContent?: string | null
}

/**
 * True when the event target is layer whitespace (not a text-bearing span).
 * Snap only runs on whitespace — native Selection handles span hits.
 * Duck-typed for unit tests (no `instanceof Element`).
 */
export function isWhitespaceHit(target: EventTarget | null): boolean {
  if (target == null || typeof target !== 'object') return false
  const el = target as ClosestEl
  if (typeof el.closest !== 'function' || typeof el.classList?.contains !== 'function') {
    return false
  }
  const layer = el.closest('.textLayer')
  if (!layer) return false
  if (el.classList.contains('endOfContent')) return true
  if (el === layer || el.classList.contains('textLayer')) return true

  const span = el.closest('.textLayer span')
  if (!span || span.classList.contains('endOfContent')) return true
  const text = span.textContent ?? ''
  return text.length === 0
}

function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) {
    return (root as Text).length > 0 ? (root as Text) : null
  }
  for (const child of root.childNodes) {
    const found = firstTextNode(child)
    if (found) return found
  }
  return null
}

function lastTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) {
    return (root as Text).length > 0 ? (root as Text) : null
  }
  for (let i = root.childNodes.length - 1; i >= 0; i--) {
    const found = lastTextNode(root.childNodes[i]!)
    if (found) return found
  }
  return null
}

export function caretFromSpanEdge(
  span: Element,
  edge: CaretEdge
): { node: Text; offset: number } | null {
  if (edge === 'start') {
    const node = firstTextNode(span)
    return node ? { node, offset: 0 } : null
  }
  const node = lastTextNode(span)
  return node ? { node, offset: node.length } : null
}

export type SpanWithBox = SnapBox & { el: Element }

/** Collect non-empty text spans with client boxes from one text layer. */
export function collectLayerSpanBoxes(layer: Element): SpanWithBox[] {
  const out: SpanWithBox[] = []
  for (const span of layer.querySelectorAll('span')) {
    if (span.classList.contains('endOfContent')) continue
    const text = span.textContent ?? ''
    if (text.length === 0) continue
    const r = span.getBoundingClientRect()
    if (r.width * r.height < 1) continue
    out.push({
      left: r.left,
      top: r.top,
      right: r.right,
      bottom: r.bottom,
      el: span
    })
  }
  return out
}

/** Resolve snap caret for whitespace at (clientX, clientY) inside `layer`. */
export function resolveSnapCaret(
  layer: Element,
  clientX: number,
  clientY: number
): { node: Text; offset: number } | null {
  const spans = collectLayerSpanBoxes(layer)
  const line = lineBandForY(spans, clientY)
  if (!line) return null
  const target = caretTargetForX(line, clientX)
  if (!target) return null
  const span = line[target.index]
  if (!span) return null
  return caretFromSpanEdge(span.el, target.edge)
}
