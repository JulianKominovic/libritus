# Web search capture

Select text (or a highlight), search the web in an in-app browser surface, and pin a screenshot onto the PDF canvas as a research artifact.

**Status:** planned.

Aligns with [`product-north.md`](product-north.md) (“record searches”, pin external references) and roadmap “Canvas research artifacts” (search captures). Trigger chrome already stubbed: **Buscar** on `HighlightToolbar` (disabled).

---

## Product goals

1. From a highlight (or text selection), open a **web search** without leaving Libritus.
2. Browse results in an **in-app browser surface** (feels like another tab; need not be a full app tab system).
3. On explicit user action, **capture a screenshot** and place it on the **canvas** (session-owned artifact).
4. Lasting research lives on the canvas — the browser is ephemeral tooling, not a research silo.

Out of scope (for now):

- Full browser product (bookmarks, adblock, extensions, multi-profile).
- Auto-capture on SERP load (must be explicit pin).
- Scraping / parsing Google HTML into structured results.
- Embedding live web pages inside Excalidraw (bounds + zoom hell).
- Parking search history only in a sidebar.

---

## UX (target)

| Step | Behavior |
|------|----------|
| **Buscar** (highlight toolbar) | Open in-app browser with search URL for the highlight text (default: Google `q=`). Remember `sourceHighlightId` when present. |
| **Browser chrome** | Minimal: back / forward, optional URL field, **Pin to canvas**, **Open in system browser**, Close. |
| **Pin to canvas** | Screenshot of the visible guest page → Excalidraw image near the highlight (or viewport center) + metadata. |
| **Open in system browser** | Escape hatch via `shell.openExternal` when CAPTCHA / blocking / preference. |
| **Traducir** (later) | Same surface; different start URL. |

Do **not** put the lasting transcript in the PDF sidebar (destination: nav-only). Optional: host-managed arrow from highlight → capture, same pattern as Add note.

---

## Technical options (browser host)

| Approach | Verdict |
|----------|---------|
| `shell.openExternal` only | No clean in-app capture loop. Keep as **fallback**, not the primary path. |
| `<iframe>` | **Dead** for Google (and most SERPs): `X-Frame-Options` / CSP `frame-ancestors`. |
| `<webview>` tag | Electron discourages; architectural instability. Avoid. |
| **`WebContentsView`** | **Preferred.** Official successor to `BrowserView`; full `webContents` + `capturePage`; main owns bounds. |
| Child `BrowserWindow` | Fastest spike for capture; weaker “tab” UX. OK for prototype. |

**Recommendation:** one **browser surface** (overlay or split over the PDF route) backed by `WebContentsView`. Do not build a multi-tab app shell in v1 — one guest instance at a time.

Today links already leave the app (`setWindowOpenHandler` → `openExternal` in `src/main/index.ts`). Guest content needs its **own** window-open / navigation policy.

### Why not iframe / “just React”

Google will not render inside a cross-origin iframe. Any “in-app Google” **must** be a real Chromium guest (`WebContentsView` / window), not DOM embedding in the Libritus renderer.

---

## Capture → canvas

```
Buscar → IPC browser:open({ url, sourceHighlightId?, pdfId })
  → main shows WebContentsView (isolated partition)
  → user browses
  → Pin → webContents.capturePage() → PNG
  → write file under appData (not a huge data-URL in session.json)
  → IPC → renderer adds Excalidraw image + customData
```

### Suggested scene model

| Field | Value |
|-------|--------|
| `type` | `image` (Excalidraw) |
| File | e.g. `{pdfId}.capture.{uuid}.png` via existing FS helpers |
| `customData.pdfSearchCapture` | `true` |
| `customData.query` | Search string |
| `customData.url` | URL at capture time |
| `customData.sourceHighlightId` | Optional link to highlight group |
| `customData.capturedAt` | ISO timestamp |

Normalize on session restore like notes/highlights. Deleting the image deletes the artifact; optionally cascade nothing else in v1.

---

## Security (guest)

Guest **must not** share the Libritus renderer session.

- `partition: 'persist:web-browser'` (cookies / consent / Google login survive) **or** ephemeral if we prefer clean slate.
- `nodeIntegration: false`, `contextIsolation: true`, **no** app preload.
- Navigation allowlist: `http:` / `https:` only; deny `file:`, `libritus:`, etc.
- Separate `setWindowOpenHandler` for the guest (new surface vs deny vs external).

---

## Bot detection, reCAPTCHA, and Google risk

### Concern

Google (and similar) may treat embedded / non-stock Chrome clients as suspicious: consent walls, “unusual traffic”, reCAPTCHA. Electron does not give a guarantee that Search stays frictionless forever.

### What actually raises risk

| Signal | Relevance to this feature |
|--------|---------------------------|
| Headless / `navigator.webdriver` / automation drivers | Low if we use a normal `WebContentsView` and **do not** drive it with Playwright-in-prod scripts. |
| Weird or mismatched User-Agent / Client Hints | Medium–high if we invent a fake Chrome UA that does not match the embedded Chromium. |
| Fresh profile, bad IP reputation | Medium on first visits. |
| Automated query loops / SERP scraping via `executeJavaScript` | **High** — not our product flow. |
| Human browse + explicit Pin | Lower — looks like a real browser session. |

This flow is closer to **Chrome-in-a-panel** than to a bot. CAPTCHA is often **account/IP/reputation**, not “Electron detected”. Still: **Google Search inside Electron is unsupported** and may regress.

### Mitigations (do)

1. Persist guest partition so consent/login stick.
2. Prefer the **native Chromium UA** of the Electron build (currently Electron ^43) — do not spoof a random desktop Chrome version.
3. Load search URL **once per user action**; no post-load scraping loops.
4. Always ship **Open in system browser**.
5. Accept occasional CAPTCHA if the user can solve it in-panel; persistence reduces repeats.

### Mitigations (don’t)

- Stealth patches, fake `webdriver`, residential proxy farms, “undetected” browser stacks. Fragile, ethically/legal murky, and Google wins that arms race.

### Product framing

Prefer feature name/mental model **“web search + capture”**, not a hard dependency on “Google embedded forever”:

- Default start URL can be Google.
- Same surface works for Bing / DuckDuckGo / Wikipedia if Google is hostile.
- Fallback: system browser + weaker canvas artifact (search card with query + URL only, no screenshot).

### Alternatives if embedded Search is too painful

| Option | Tradeoff |
|--------|----------|
| External browser only + search **card** on canvas (query, URL, timestamp, open link) | Zero in-app CAPTCHA; weaker visual evidence. |
| In-app browser with DDG/Bing default; Google optional | More stable embeds; less “Google” branding. |
| Hybrid: try in-app; one click to system browser | Best practical resilience. |
| Paste / import screenshot from OS | Max compatibility; worst flow. |

**Design assumption for MVP:** occasional CAPTCHA is acceptable; systematic blocking is not a reason to skip the feature if hybrid escape hatch exists. Do **not** promise uninterrupted Google SERP embedding.

---

## MVP vs later

### MVP

- Wire **Buscar** → one browser surface + Google search URL from highlight text.
- Isolated persist partition; minimal chrome; Pin → PNG file + Excalidraw image + `customData`.
- **Open in system browser**.
- No multi-tab browser; no SERP scraping.

### Later

- Multiple guest “tabs”.
- **Traducir** on same surface.
- Optional arrow highlight → capture.
- Search card without screenshot as degraded artifact.
- Page-space anchoring for captures (with the rest of annotation migration).

### Spike path (optional)

Child `BrowserWindow` + `capturePage` → image on scene, to validate capture/FS/session before investing in `WebContentsView` bounds sync with React chrome.

---

## Files / hooks (expected)

| Area | Touch |
|------|--------|
| Main | Create/show/hide `WebContentsView` (or spike window); IPC open / pin / close; `capturePage`; write PNG. |
| Preload / IPC | Thin bridge; guest must not get app privileges. |
| `HighlightToolbar` | Enable **Buscar**; pass query + `sourceHighlightId`. |
| `PdfCanvasApp` / session | Insert image element; dirty/autosave; restore paths for capture files. |
| FS | Store PNGs beside session/PDF data under appData. |

Do not put guest pages into the Excalidraw element store as live embeds. Do not deepen sidebar research chrome for this.

---

## Open decisions

1. Overlay vs split vs child window for v1 chrome.
2. Persist vs ephemeral guest partition (login convenience vs privacy).
3. Default search engine (Google vs DDG) given bot-detect risk.
4. Whether Pin also creates a host-managed arrow from the source highlight.
5. How capture files are garbage-collected when the image is deleted from the scene.
