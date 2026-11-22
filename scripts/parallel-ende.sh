#!/usr/bin/env bash
# Arbeitsstrang aus scripts/parallel-start.sh wieder abräumen.
#
#   scripts/parallel-ende.sh <name>           # nur wenn alles committet und in master gemergt ist
#   scripts/parallel-ende.sh <name> --verwerfen   # Arbeit absichtlich wegwerfen
#
# Entfernt Worktree, Branch parallel/<name>, Profil und den Herdr-Tab.
# Ohne --verwerfen bricht es ab, sobald noch ungesicherte Arbeit da ist.

set -euo pipefail

NAME="${1:-}"
MODUS="${2:-}"
HAUPT="$HOME/dev/mindgraph-notes"
STRANG="$HOME/dev/mindgraph-parallel/$NAME"
REPO="$STRANG/repo"
BRANCH="parallel/$NAME"

if ! [[ "$NAME" =~ ^[a-z][a-z0-9-]{0,31}$ ]] || { [ -n "$MODUS" ] && [ "$MODUS" != "--verwerfen" ]; }; then
  echo "Aufruf: $0 <name> [--verwerfen]" >&2
  exit 2
fi
if [ ! -d "$STRANG" ]; then
  echo "Kein Strang '$NAME' unter $STRANG." >&2
  exit 1
fi

if [ "$MODUS" != "--verwerfen" ] && [ -d "$REPO" ]; then
  if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
    echo "Im Strang liegen noch nicht committete Änderungen:" >&2
    git -C "$REPO" status --short >&2
    echo "Erst committen und mergen — oder bewusst: $0 $NAME --verwerfen" >&2
    exit 1
  fi
  OFFEN=$(git -C "$HAUPT" rev-list --count "master..$BRANCH" 2>/dev/null || echo 0)
  if [ "$OFFEN" != "0" ]; then
    echo "$OFFEN Commit(s) auf $BRANCH sind noch nicht in master:" >&2
    git -C "$HAUPT" log --oneline "master..$BRANCH" >&2
    echo "Erst mergen (git merge $BRANCH) — oder bewusst: $0 $NAME --verwerfen" >&2
    exit 1
  fi
fi

if [ -f "$STRANG/herdr-tab" ] && [ "${HERDR_ENV:-}" = 1 ]; then
  TAB_ID=$(cat "$STRANG/herdr-tab")
  if [ "$TAB_ID" != "${HERDR_TAB_ID:-}" ]; then
    herdr tab close "$TAB_ID" >/dev/null 2>&1 || echo "Herdr-Tab $TAB_ID war schon zu."
  else
    echo "Läuft im Tab des Strangs selbst — Tab bitte von Hand schließen."
  fi
fi

if [ -d "$REPO" ]; then
  git -C "$HAUPT" worktree remove --force "$REPO"
fi
git -C "$HAUPT" worktree prune
if git -C "$HAUPT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$HAUPT" branch -D "$BRANCH" >/dev/null
fi
rm -rf "$STRANG"

echo "Strang '$NAME' ist abgeräumt (Worktree, Branch $BRANCH, Profil, Herdr-Tab)."
