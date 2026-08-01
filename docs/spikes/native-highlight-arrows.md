# Spike: flechas nativas Excalidraw (highlight → note / search)

Deferred from `to-fix.md` / plan fix-to-fix-bugs. Take this later — not part of the current bugfix batch.

## Context

Today Add note / Buscar create **host-managed** straight arrows (`pdfNoteArrow` / `pdfSearchArrow`, `locked`, `startBinding`/`endBinding: null`) and recompute geometry via `syncPdfNoteArrows` / `syncPdfSearchArrows` + `arrowBetweenRects`.

Aprendizajes / AGENTS.md documented why: locked highlights not bindable, one-sided `endBinding` exploding (~1e5px) on embed drag, mid-draw migrate → `Maximum update depth`.

## What recent guards actually fixed

| Failure                               | Status                                                                                                                                                                                                  |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Maximum update depth` mid-draw       | **Fixed** by `migrateBoundArrows: false` + skip host `updateScene` while `newElement`/`multiElement` (`11dbc27`, `b8fb47c`). That was host sync fighting free draws — not proof that bindings are safe. |
| One-sided `endBinding` ~1e5px explode | **Not fixed by those commits** — guards never touch Excalidraw `updateBoundElements`. Still asserted in create comments / AGENTS.md, **not re-verified** after recent embed/search work.                |
| Locked highlight / both-ends rebind   | Still true on Excalidraw 0.18.1 unless a spike proves otherwise.                                                                                                                                        |

## Spike approach

1. In `createNoteFromHighlight` (then search), create a **two-sided** straight unlocked arrow: `startBinding` → primary highlight id, `endBinding` → note, update `boundElements` on both. **No** `pdfNoteArrow` / skip host sync for that id (host sync today forces bindings null — must bypass).
2. Manual checklist: drag note (no explode); drag arrow handles (no zero-length snap); delete note + undo; reopen session; Place-note free arrows still ok.
3. Control: same with **end-only** binding — if that still explodes and two-sided does not, native is viable with two-sided only.
4. **If spike fails:** leave host sync; update aprendizajes with “re-verified YYYY still explodes”.
5. **If spike passes:** migrate Buscar the same way; remove/retire `syncPdfNoteArrows` / `syncPdfSearchArrows` for new connectors; keep cascade via `sourceHighlightId` (or bindings + helpers); update e2e that assert null bindings; update AGENTS.md / aprendizajes.

Do not ship a half-migrate (host sync still stripping bindings on the same arrows).

## Key files

- `src/renderer/src/lib/pdf-canvas/pdfNotes.ts` — `createNoteFromHighlight`, `syncPdfNoteArrows`
- `src/renderer/src/lib/pdf-canvas/pdfSearchCapture.ts` — `createSearchCaptureFromHighlight`, `syncPdfSearchArrows`
- `src/renderer/src/lib/pdf-canvas/arrowBetweenRects.ts`
- `src/renderer/src/organisms/pdf-canvas/PdfCanvasApp.tsx` — live sync (`migrateBoundArrows: false`)
- `AGENTS.md` (arrow troubleshooting), `.cursor/skills/apredizajes/SKILL.md`
