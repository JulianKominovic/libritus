import type { PdfDocument } from './PdfDocument'

export type OutlineNode = {
  title: string
  /** 0-based page index, or null when the destination cannot be resolved. */
  pageIndex: number | null
  children: OutlineNode[]
}

export type FlatOutlineRow = {
  title: string
  pageIndex: number | null
  depth: number
}

/** Depth-first flatten for virtualized outline lists (always expanded). */
export function flattenOutline(nodes: OutlineNode[], depth = 0): FlatOutlineRow[] {
  const out: FlatOutlineRow[] = []
  for (const n of nodes) {
    out.push({ title: n.title, pageIndex: n.pageIndex, depth })
    if (n.children.length > 0) out.push(...flattenOutline(n.children, depth + 1))
  }
  return out
}

type RawOutlineItem = {
  title: string
  dest: string | Array<unknown> | null
  items: RawOutlineItem[]
}

type OutlineProxy = {
  getOutline: () => Promise<RawOutlineItem[] | null>
  getDestination: (id: string) => Promise<Array<unknown> | null>
  getPageIndex: (ref: unknown) => Promise<number>
}

/** Extract the page ref from a pdf.js destination array (first element). */
function pageRefFromDest(dest: Array<unknown> | null): unknown | null {
  if (!dest || dest.length === 0) return null
  return dest[0] ?? null
}

async function resolvePageIndex(
  proxy: OutlineProxy,
  dest: string | Array<unknown> | null
): Promise<number | null> {
  if (dest == null) return null
  try {
    const resolved = typeof dest === 'string' ? await proxy.getDestination(dest) : dest
    const ref = pageRefFromDest(resolved)
    if (ref == null) return null
    const index = await proxy.getPageIndex(ref)
    return Number.isFinite(index) ? index : null
  } catch {
    return null
  }
}

async function mapItem(proxy: OutlineProxy, item: RawOutlineItem): Promise<OutlineNode> {
  const pageIndex = await resolvePageIndex(proxy, item.dest)
  const children: OutlineNode[] = []
  for (const child of item.items ?? []) {
    children.push(await mapItem(proxy, child))
  }
  return { title: item.title || 'Untitled', pageIndex, children }
}

/**
 * Load the PDF's embedded outline and resolve each destination to a 0-based pageIndex.
 * Missing outline → []. Unresolvable dests → pageIndex null (caller disables the row).
 * // ponytail: XYZ top → scrollForWorldY if mid-page TOC matters
 */
export async function loadOutline(doc: PdfDocument): Promise<OutlineNode[]> {
  const proxy = doc.proxy as unknown as OutlineProxy
  let raw: RawOutlineItem[] | null
  try {
    raw = await proxy.getOutline()
  } catch {
    return []
  }
  if (!raw || raw.length === 0) return []

  const nodes: OutlineNode[] = []
  for (const item of raw) {
    nodes.push(await mapItem(proxy, item))
  }
  return nodes
}
