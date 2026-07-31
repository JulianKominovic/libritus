#!/usr/bin/env bash
# Pre-create one GitHub draft, then electron-builder --publish always uploads into it.
# Avoids the concurrent-upload race that splits assets across two drafts.
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v gh >/dev/null; then
  echo "gh CLI required (https://cli.github.com/)" >&2
  exit 1
fi

VERSION="$(node -p "require('./package.json').version")"
TAG="${VERSION}"

export GH_TOKEN="${GH_TOKEN:-${GITHUB_TOKEN:-$(gh auth token)}}"
if [[ -z "${GH_TOKEN}" ]]; then
  echo "No GitHub token — run: gh auth login" >&2
  exit 1
fi

echo "→ Reset draft ${TAG}"
gh release delete "${TAG}" --yes --cleanup-tag 2>/dev/null || true
gh release create "${TAG}" --draft --title "${TAG}" --notes ""

echo "→ Build + publish (win x64 / mac arm64 / linux x64 — arches from electron-builder.yml)"
bun run build
# Arches come from electron-builder.yml — do not pass --x64/--arm64 together (global flags).
electron-builder --win --mac --linux --publish always

echo "→ Draft ready: $(gh release view "${TAG}" --json url -q .url)"
echo "  Publish when ready: gh release edit ${TAG} --draft=false"
