# Web search capture

Select text (or a highlight), search the web in a dedicated in-app browser window, and pin a screenshot — or a PDF preview — onto the PDF canvas as a research artifact.

**Status:** implemented (singleton `BrowserWindow`).

Aligns with [`product-north.md`](product-north.md) (“record searches”, pin external references). First shipped piece of roadmap “Canvas research artifacts”. Cross-PDF / annotate-the-clip: [`pdf-clips.md`](pdf-clips.md) (planned). Triggers: **Buscar** on `HighlightToolbar`, **Place browser** on the PDF tools toolbar, **paste** / **drop** an http(s) URL, navbar globe, or center-click an existing capture card.

---

## Product goals

1. From a highlight, the toolbar, the navbar, or a capture card, open a **web browser** without leaving Libritus.
2. One guest window at a time (singleton). It stays open while you work — blur does not snapshot it.
3. **Capturar** always **adds** a new screenshot card. **Actualizar captura** replaces the selected web embed (thumbnail in chrome). **Guardar como PDF** embeds a compact PDF preview card (bytes in `attachments/`).
4. Lasting research lives on the canvas.

Out of scope (for now):

- Full browser product (bookmarks, adblock, extensions, multi-profile, tabs).
- SERP scraping / parsing Google HTML.
- Embedding a live `<webview>` inside Excalidraw.
- Annotating the saved PDF clip (highlights/notes) — see [`pdf-clips.md`](pdf-clips.md).
- Attachment GC when the canvas element is deleted (orphans on disk are OK).
- Parking search history only in a sidebar.

---

## UX

| Step | Behavior |
| --- | --- |
| **Navbar globe** | PDF route only, left of the PDF sidebar toggle. Show/focus the singleton window. No canvas card until Capturar / Guardar como PDF. If the guest is blank, loads Google. |
| **Buscar** | Creates a mobile-sized (430×930) embeddable + host-managed arrow from the highlight. Centers the camera and opens the window at the Google search URL. Card is selected → **Actualizar** can fill it. |
| **Place browser** | Toolbar toggle. Next canvas click places an unanchored embeddable (Google) and opens the window. |
| **Paste / drop URL** | Unanchored embeddable at viewport center / drop point, then opens the window at that URL. |
| **Click capture card** | Center-click (placeholder or promoted image) show/focuses the window at `customData.url` (else Google from query) and selects the card. |
| **Capturar** | Always adds a **new** search-capture image at viewport center (PNG + URL). Does not replace the selected card. Window stays open. Card size fits the screenshot (max 480×720). |
| **Actualizar captura** | Visible only when exactly one `pdfSearchCapture` is selected on the canvas. Dock shows a thumbnail of that card. Replaces its PNG/URL/size. |
| **Guardar como PDF** | HTML → `printToPDF`; `.pdf` URLs → fetch bytes; `will-download` of `application/pdf` also embeds. Compact `pdfClip` image on the canvas (not a library PDF, not a second document axis). Window stays open. |
| **Window chrome** | Hidden title bar (same as the app: traffic lights / overlay). 50px navbar: back / forward / URL only. Floating dock over the guest (bottom-center): thumbnail + Actualizar when a capture is selected, Capturar, Guardar como PDF. Guest starts at **100%** zoom; Cmd/Ctrl ± / 0 for zoom (no chrome buttons). Cmd/Ctrl+L focuses the URL field. Close (traffic light) hides; does not quit the app. |
| **Style panel** | Host activate ignores Excalidraw `.layer-ui__wrapper` so style clicks do not open a capture underneath. |
| **Catalog stats** | Live `pdfSearchCapture` count writebacked as `canvasStats.searches`. |

---

## Architecture

```
Navbar / Buscar / Place / paste / drop / click card
  → IPC browser:show({ url? })
  → singleton BrowserWindow (hide-on-close, hidden title bar)
      window webContents = navbar (browser-ui)
      guest WebContentsView (below navbar)
      actions WebContentsView (pill-sized overlay, bottom-center)
  → canvas selection → browser:setCaptureTarget (id + thumb)
  → Capturar → capturePage PNG → browser:captured (captureId: null) → new card
  → Actualizar → capturePage PNG → browser:captured (captureId) → replace card
  → Guardar como PDF → attachments/*.pdf + preview PNG → pdfClip image
```

Guest is **not** a `<webview>` in Excalidraw and **not** a `WebContentsView` overlay on the canvas. Partition `persist:web-browser`. Leave PDF → hide (no auto-capture). Quit → destroy.

### Scene model (search capture)

Unchanged identity: `customData.pdfSearchCapture`. Placeholder `embeddable` (`libritus://pdf-search-capture`); after Capturar/Actualizar, native `image` with `fileId`. Arrow (Buscar only): `pdfSearchArrow`, locked, no bindings.

### Scene model (PDF clip)

See [`pdf-clips.md`](pdf-clips.md). `customData.pdfClip`, `fileId` = PDF attachment, `previewFileId` = page-0 / screenshot PNG (also the Excalidraw `image` fileId). Compact card (~280px wide). Click does not open the clip as the session root.

### Security (guest)

- `partition: 'persist:web-browser'`
- Third-party cookies allowed (switches before `app.ready`)
- Guest: `nodeIntegration: false`, `contextIsolation: true`, no app preload
- Navigation: http(s) only (`about:` allowed mid-nav)
- Chromium UA with `Electron/…` stripped
- Open in system browser (context menu)
- Nav + actions chrome: app preload locked to `browser-ui.html` only (`will-navigate` / `will-redirect` deny remote). Actions overlay is sized to the dock (a WCV is a solid hit-rect).

### Closed decisions

1. Dedicated singleton `BrowserWindow` (hidden title bar, same navbar shell as the app). Not a canvas overlay, not a DOM webview.
2. Electron does not ship Chrome omnibox/tabs — custom URL + back/forward only.
3. Capture and Save as PDF are explicit (floating dock over the guest). Blur / outside-click does not snapshot.
4. **Capturar** = add; **Actualizar** = replace selected (live selection, not sticky open source).
5. Persist guest partition; zoom resets to 100% on load (user may Cmd± after).
6. Default search engine: Google.
7. Host-managed arrow from highlight: yes.
8. No attachment GC on delete.
9. Post-capture: native Excalidraw `image`.
10. Saved PDFs stay session attachments (`attachments/{id}.pdf`), not `categories.json`.

---

## Files

| Area | Touch |
| --- | --- |
| Main | [`src/main/web-browser.ts`](../../src/main/web-browser.ts), [`web-browser-url.ts`](../../src/main/web-browser-url.ts) |
| Shell | [`src/renderer/browser-ui.html`](../../src/renderer/browser-ui.html), [`src/renderer/src/browser-ui.tsx`](../../src/renderer/src/browser-ui.tsx) |
| Renderer IPC | [`integrations/webBrowser.ts`](../../src/renderer/src/integrations/webBrowser.ts) |
| Model | [`pdfSearchCapture.ts`](../../src/renderer/src/lib/pdf-canvas/pdfSearchCapture.ts), [`pdfClip.ts`](../../src/renderer/src/lib/pdf-canvas/pdfClip.ts) |
| Host | [`PdfCanvasApp.tsx`](../../src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx), [`useSearchCaptureBrowser.ts`](../../src/renderer/src/organisms/pdf-canvas/useSearchCaptureBrowser.ts), [`navbar.tsx`](../../src/renderer/src/templates/navbar.tsx) |
| Embed | [`SearchCaptureEmbed.tsx`](../../src/renderer/src/organisms/pdf-canvas/SearchCaptureEmbed.tsx) |

---

## Bot / CAPTCHA

Google may show CAPTCHA in the guest. Acceptable for MVP; **Open in system browser** is the escape.

---

## Later

- Annotate / cite PDF clips — [`pdf-clips.md`](pdf-clips.md).
- Multiple guest tabs.
