# Web search capture

Select text (or a highlight), search the web in an in-app browser surface, and pin a screenshot onto the PDF canvas as a research artifact.

**Status:** implemented (hybrid embed).

Aligns with [`product-north.md`](product-north.md) (“record searches”, pin external references). First shipped piece of roadmap “Canvas research artifacts”; remaining artifacts (vocab, YouTube, …) still later. Triggers: **Buscar** on `HighlightToolbar`, or **Place browser** on the PDF tools toolbar (unanchored).

---

## Product goals

1. From a highlight **or the toolbar**, open a **web search** without leaving Libritus.
2. Browse in an **in-app browser** (one guest at a time).
3. On exit from the browser (click outside / Escape), **capture a screenshot** and show it on the **canvas**.
4. Lasting research lives on the canvas — the live browser is ephemeral tooling.

Out of scope (for now):

- Full browser product (bookmarks, adblock, extensions, multi-profile).
- Multi-tab guest shell.
- SERP scraping / parsing Google HTML.
- Embedding a live `<webview>` inside Excalidraw (zoom/bounds hell).
- Attachment GC when the canvas element is deleted (orphans on disk are OK).
- Parking search history only in a sidebar.

---

## UX

| Step | Behavior |
|------|----------|
| **Buscar** | Creates a mobile-sized (430×930) embeddable + host-managed arrow from the highlight (initial L/R parity; sync re-anchors to shortest AABB segment on drag). Selects the card; does **not** auto-activate. Google search URL from highlight text. |
| **Place browser** | Toolbar toggle (like Place note). Next canvas click places the same embeddable at the pointer, **no** arrow / no `sourceHighlightId`. Initial URL `https://www.google.com`. Selects only — does not auto-activate. |
| **Activate** | Center click (same as notes) → one frameless guest `BrowserWindow` aligned to the shape in screen space (default page zoom 0.8, `alwaysOnTop` while open). Chrome above: back / forward / zoom % (−/⌘−, +/⌘+) / portrait (430×932) / landscape (1200×800). Cmd/Ctrl± zooms the guest. |
| **Exit** | Escape or click outside → `capturePage` PNG under `attachments/` → native Excalidraw `image` with 16px rounded corners. |
| **Resize / drag** | Excalidraw owns geometry (like notes). Arrows sync via host (no Excalidraw bindings). |
| **Style panel** | Host activate/deactivate ignores Excalidraw `.layer-ui__wrapper` (and menus) so clicks on stroke/fill chrome do not open a capture sitting under the panel in scene space. |
| **Catalog stats** | Live `pdfSearchCapture` count writebacked as `canvasStats.searches` (category / home card globe pill). |

---

## Architecture (hybrid)

```
Buscar / Place browser → create embeddable (libritus://pdf-search-capture) [+ arrow if from highlight]
  → user activates → IPC browser:open({ url, bounds })
  → main shows frameless BrowserWindow (partition persist:web-browser)
  → pan/zoom/resize → browser:setBounds
  → deactivate → capturePage PNG → attachments/{fileId}.png
  → promote shape to native Excalidraw image (customData.fileId / url / capturedAt)
```

**Not** a `<webview>` in the renderer. **Not** a live page inside Excalidraw’s transform tree. The guest is a frameless `BrowserWindow` overlay (not parented; `WebContentsView` aborted mid-load in-app) aligned to the shape; placeholder stays an embeddable until a screenshot exists, then a native `image`.

### Scene model

| Field | Value |
|-------|--------|
| `type` | `embeddable` (placeholder) or `image` (after screenshot / restore with `fileId`) |
| `link` | `libritus://pdf-search-capture` on placeholder embeddable |
| size | 430 × 930 |
| `customData.pdfSearchCapture` | `true` |
| `customData.query` | Search string |
| `customData.url` | URL at capture / last browse |
| `customData.sourceHighlightId` | Highlight group id (omitted for Place browser) |
| `customData.fileId` | Attachment id when a PNG exists |
| `customData.capturedAt` | ISO timestamp |

Arrow (Buscar only): `customData.pdfSearchArrow` + `captureId` / `startX` / `startY` / `side`, locked, no bindings — same pattern as notes. `syncPdfSearchArrows` recomputes both ends to the shortest highlight↔card AABB segment. Place browser cards have no arrow.

### Security (guest)

- `partition: 'persist:web-browser'` (cookies + storage on disk)
- Third-party cookies allowed (`BlockThirdPartyCookies` / `ThirdPartyStoragePartitioning` disabled before `app.ready`); Storage Access API permission granted for the guest session
- Cookie jar flushed on deactivate
- `nodeIntegration: false`, `contextIsolation: true`, no app preload
- Navigation: `http:` / `https:` only (`about:` allowed mid-nav)
- Native Chromium UA with `Electron/…` stripped (looks like Chrome; same engine version)
- Open in system browser escape hatch

### Closed decisions

1. Overlay aligned to shape (frameless `BrowserWindow`), not `WebContentsView` / not DOM webview.
2. Persist guest partition.
3. Default search engine: Google (with system-browser fallback).
4. Host-managed arrow from highlight: yes.
5. No attachment GC on delete.
6. Post-capture: native Excalidraw `image` (bypasses sticky `embedsValidationStatus`).

---

## Files

| Area | Touch |
|------|--------|
| Main | [`src/main/web-browser.ts`](../../src/main/web-browser.ts) |
| Renderer IPC | [`src/renderer/src/integrations/webBrowser.ts`](../../src/renderer/src/integrations/webBrowser.ts) |
| Model | [`pdfSearchCapture.ts`](../../src/renderer/src/lib/pdf-canvas/pdfSearchCapture.ts), [`excalidrawUiTarget.ts`](../../src/renderer/src/lib/pdf-canvas/excalidrawUiTarget.ts) (ignore style-panel hit-tests) |
| Embed | [`SearchCaptureEmbed.tsx`](../../src/renderer/src/organisms/pdf-canvas/SearchCaptureEmbed.tsx) |
| Host | [`PdfCanvasApp.tsx`](../../src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx), [`BrowserChrome.tsx`](../../src/renderer/src/organisms/pdf-canvas/BrowserChrome.tsx), [`useSearchCaptureBrowser.ts`](../../src/renderer/src/organisms/pdf-canvas/useSearchCaptureBrowser.ts), [`HighlightToolbar.tsx`](../../src/renderer/src/organisms/pdf-canvas/HighlightToolbar.tsx) |

---

## Bot / CAPTCHA

Google may show CAPTCHA in the guest. Acceptable for MVP; **Open in system browser** is the escape. Feature framing: “web search + capture”, not a hard Google guarantee.

---

## Later

- Traducir on same surface.
- Multiple guest “tabs”.
- Search card without screenshot as degraded artifact.
- Optional page-space anchoring if/when [`page-space-annotations.md`](page-space-annotations.md) lands.
