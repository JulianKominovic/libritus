<p align="center"><img src="./app-icon.png" width="256" height="256"/></p>
<h1 align="center">
  Libritus
</h1>
<p align="center">
Desktop research workspace: read PDFs on an infinite canvas, and keep the investigation — notes, diagrams, links, free annotations — on that canvas so you can follow your reasoning later. AI answers only when you ask; it does not auto-summarize or underline for you.
</p>

<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 10 12 20 PM" src="https://github.com/user-attachments/assets/77b35121-e2fd-4d7d-8350-a3fca917dfb0" />
<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 8 34 31 PM" src="https://github.com/user-attachments/assets/1f412e7a-4547-44e4-84ee-d04097078e50" />
<img width="1840" height="1191" alt="wikipedia-definitions" src="https://github.com/user-attachments/assets/34391e7e-14a2-49e1-ab86-6843d3ebc857" />
<img width="1840" height="1191" alt="Screenshot 2025-09-16 at 8 36 31 PM" src="https://github.com/user-attachments/assets/44454453-d7f9-4093-8809-927c440066f0" />

![Screenshot 2025-09-16 at 8 42 44 PM](https://github.com/user-attachments/assets/f78e2349-2f89-4647-bba8-ec77fc49bb6e)

## Research canvas

The PDF viewer is an **infinite canvas** (Excalidraw + EmbedPDF / PDFium): virtualized pages, free pan/zoom, and freeform research on top of the document. Product north, architecture, roadmap, and agent conventions:

- [`docs/features/product-north.md`](docs/features/product-north.md) — research canvas premises (canvas owns research; AI subordinate)
- [`AGENTS.md`](AGENTS.md) — operational ground truth for contributors and agents
- [`docs/architecture/infinite-pdf-canvas.md`](docs/architecture/infinite-pdf-canvas.md) — vision and optimal architecture
- [`docs/roadmap.md`](docs/roadmap.md) — v1 → v2 path, research-on-canvas debt, legacy migration
- [`docs/features/persistence-and-sessions.md`](docs/features/persistence-and-sessions.md)
- [`docs/features/pdf-navigation.md`](docs/features/pdf-navigation.md)

The previous lector-based vertical reader has been removed; the canvas viewer is the only PDF path.

## Follow the journey!

Progress notes: https://jkominovic.dev

## Download (macOS)

Grab the latest `.dmg` from [Releases](https://github.com/JulianKominovic/libritus/releases) (Apple Silicon: `*-mac-arm64-setup.dmg`), open it, and drag **Libritus** into Applications.

macOS may say the app is **damaged** and offer to move it to the Trash. That is Gatekeeper blocking an unsigned build — the app is fine. In Terminal:

```bash
xattr -cr /Applications/Libritus.app
```

Then open Libritus again. (Right-click → Open, or **System Settings → Privacy & Security → Open Anyway**, can also work.)

## Development

```bash
git clone git@github.com:JulianKominovic/libritus.git
cd libritus
bun install
bun run dev
```

Packaged mac build:

```bash
bun run build:mac
```

## Mascot

<img width="400" height="400" alt="Libritus mascot" src="https://github.com/user-attachments/assets/a30341eb-9b83-4227-adb6-95f07a50fc76" />
