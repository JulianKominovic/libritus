# Navigation history

In-memory history of page jumps while a PDF is open, with a clock-button popover next to the page navigator.

**Status:** planned — not shipped.

---

## Product goals

1. Record page navigations (prev/next, jump input, outline/thumb jumps, find-bar jumps) in a session-local history.
2. Cap at **100** visited entries (drop oldest).
3. Next to the page-back control in `PageNavigator`, a **history** button (clock icon) opens a popover of recent pages.
4. Popover list: visited pages ordered by visit time; first item is pinned as the **furthest page reached** this session (labeled as such). Each row shows a page thumbnail (same idea as `PdfSidebar` thumbs); click → jump to that page.

Out of scope (for now):

- Persisting history across app restarts (in-memory only).
- Cross-PDF history.
- Replacing outline / thumbs / find bar.

---

## UX

| Control | Behavior |
|---------|----------|
| **History button** | Clock icon beside back in [`PageNavigator.tsx`](../../src/renderer/src/organisms/pdf-canvas/PageNavigator.tsx). |
| **Popover** | List of visited pages; pin “max page reached” at top with legend; thumbs like [`PdfSidebar`](../../src/renderer/src/organisms/pdf-canvas/PdfSidebar.tsx). |
| **Row click** | `goToPage` (same zoom / stable X as other jumps). |

---

## Model / approach

- Ring buffer / deque of `{ pageIndex, visitedAt }` (max 100) + separate `maxPageReached`.
- Push on intentional navigations; ignore pure pan that does not change primary page if that is noisy.
- Reuse `ThumbPool` or sidebar thumb helpers — do not rasterize a second full-res pool.

---

## Relation to other features

| Feature | Interaction |
|---------|-------------|
| **PDF navigation** | History chrome lives next to existing navigator. |
| **Outline / thumbs / find** | Those jumps should feed the history. |
| **Sessions** | Do not write history into `{pdfId}.session.json` for v1 of this feature. |
