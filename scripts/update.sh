#!/bin/zsh
# Updates this copy of MacThing to the latest release: moves main to the newest v* tag, installs
# dependencies, rebuilds, and restarts the login agent. The settings page's "Update now" button
# runs this with --no-restart and then lets the bridge exit, so launchd starts the new version.
#   scripts/update.sh [--no-restart]
# Exit codes: 0 updated (or already up to date), 1 failed. Each step is announced on a line that
# starts with "▸ ", and the last line printed on failure says what went wrong.
set -euo pipefail

ROOT="${0:A:h:h}"
cd "$ROOT"
RESTART=1
DETAILS=" — see the messages above."
# From the settings page, this output goes to the update log instead of a terminal.
[[ "${1:-}" == "--no-restart" ]] && { RESTART=0; DETAILS=". Details: ~/Library/Logs/macthing-update.log"; }

fail() { echo "$1" >&2; exit 1; }

[[ -e .git ]] || fail "This copy wasn't installed with git clone. Download the new version from GitHub."
branch="$(git symbolic-ref --short -q HEAD || true)"
[[ "$branch" == "main" ]] || fail "This copy is on ${branch:-no branch}, not main. Switch to main to update."
[[ -z "$(git status --porcelain --untracked-files=no)" ]] || fail "This copy has local changes. Commit or stash them first."

echo "▸ Downloading"
git fetch --quiet --tags origin || fail "Couldn't reach GitHub. Check your internet connection."
tag="$(git tag --list 'v*' --sort=-v:refname | head -1)"
[[ -n "$tag" ]] || fail "No releases found."
old="$(git rev-parse HEAD)"

if git merge-base --is-ancestor "$tag" HEAD; then
  echo "Already up to date ($tag)."
  exit 0
fi
git merge --quiet --ff-only "$tag" 2>/dev/null \
  || fail "Couldn't move to $tag: this copy has commits that aren't in the release. Update it with git."

# From here a failure puts the old version back, so the bridge keeps a working copy.
rollback() {
  echo "Going back to the version you had…"
  git reset --quiet --keep "$old" && npm ci --no-audit --no-fund --loglevel=error && npm run --silent build:ui || true
}
step() {
  local label="$1"; shift
  echo "▸ $label"
  "$@" || { local code=$?; rollback; fail "$label failed (exit $code)${DETAILS}"; }
}
step "Installing dependencies" npm ci --no-audit --no-fund --loglevel=error
# Native helpers whose source didn't change are kept, along with their macOS permissions.
step "Building" npm run --silent build

echo "Updated to $tag."
if (( RESTART )); then
  if launchctl print "gui/$(id -u)/com.carthing.bridge" >/dev/null 2>&1; then
    echo "▸ Restarting"
    ./scripts/launch-agent.sh restart
  else
    echo "Restart the bridge (npm start) to use the new version."
  fi
fi
