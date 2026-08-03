---
name: create-pr
description: >
  Create a GitHub pull request for Libritus with a product-first title and a
  two-section body (High level explanation + Technical explanation). Manual
  only — ask for base and head branch confirmation before opening the PR.
  Use when the user explicitly invokes create-pr, /create-pr, or asks to run
  this skill to open a PR.
disable-model-invocation: true
---

# Create PR

Manual-only skill. Do **not** open a PR until the user confirms base and head branches.

## 1. Confirm branches

Before any push/`gh pr create`:

1. Detect the current branch (`git branch --show-current`).
2. Ask the user to confirm:
   - **Base branch** (default: `master`)
   - **Branch to merge** / head (default: current branch)
3. Wait for an explicit yes (or corrected branch names). Do not proceed on silence or assumption.

## 2. Inspect the change set

In parallel:

- `git status`
- `git diff <base>...<head>` (full range to merge)
- `git log <base>..<head>` (all commits on the PR)
- Check whether head tracks a remote and is up to date

Push with `-u` if the head branch is not on the remote yet.

## 3. Title

Format: `<type>: <brief description>`

Types (pick one): `feature`, `bug`, `fix`, `chore`, `docs`, `test`, `perf`, etc.

- Prefer a **product-oriented** description: what the user/product gains or how behavior changes.
- Do **not** force product framing when the change is purely internal (infra, refactor with no user-visible impact) — then a short accurate technical title is fine.
- Keep the description very brief.

Examples:

- `feature: jump to page from outline sidebar`
- `fix: keep highlights after zooming the canvas`
- `chore: bump pdfium.wasm / EmbedPDF engines`

## 4. Body

High-level only in both sections. No long file lists, no commit dumps.

Use this structure verbatim (section titles exact):

```markdown
## High level explanation

- <plain-language product/user-facing change>
- <…>

## Technical explanation

- <short technical summary for Libritus maintainers / engineers>
- <…>
```

### High level explanation

- List what changed for the **product / user**.
- Very simple wording. No Libritus jargon, no engineering jargon.
- Anyone without software knowledge should understand each bullet.

### Technical explanation

- Still high-level, short, and to the point.
- Technical vocabulary is OK (Excalidraw, session flush, IPC, pools, etc.).
- Aimed at Libritus maintainers and other engineers — not a line-by-line code tour.

## 5. Create the PR

Use `gh` for all GitHub operations. Do not use TodoWrite or Task tools for this workflow.

```bash
git push -u origin HEAD   # if needed

gh pr create --base <base> --head <head> --title "<type>: <brief description>" --body "$(cat <<'EOF'
## High level explanation

- …

## Technical explanation

- …

EOF
)"
```

Return the PR URL when done. Do not push or open a PR if the user only asked to draft title/body.
