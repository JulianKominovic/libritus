## Bug de desborde y crecimiento desmedido de excalidraw (deferred upstream)

Editing Excalidraw native text off-screen then typing can grow the container (`scrollIntoView`). Tracked in AGENTS.md conscious gaps — wait for Excalidraw [#11056](https://github.com/excalidraw/excalidraw/pull/11056) / release; do not host-mitigate.

## Evaluar flechas nativas Excalidraw (deferred)

→ [`docs/spikes/native-highlight-arrows.md`](docs/spikes/native-highlight-arrows.md)

## Done (this batch)

- Webembed zoom wrong until resize — re-apply after open + post-visible in main
- Autofocus / autocenter on Buscar + Place browser (Place deferred past pointerdown)
- Excalidraw zoom / undo-redo / help footer buttons white
- Image insert CSP `blob:` on `img-src` (should also unblock insert undo path)
- NoteEmbed padding `p-2` → `p-4`

# Futuras features
