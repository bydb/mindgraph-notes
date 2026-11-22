#!/usr/bin/env bash
# Zweiten Arbeitsstrang neben dem normalen Repo starten — nur bei Bedarf.
#
#   scripts/parallel-start.sh <name> [basis]      # basis: Default master
#
# Legt an (alles unter ~/dev/mindgraph-parallel/<name>/):
#   repo/     eigener git worktree auf Branch parallel/<name>
#   profil/   eigenes App-Profil (Kopie des Testprofils), damit die Dev-App
#             neben anderen laufen darf (Instanzsperre hängt am Profil)
#   dev.sh    startet die Dev-App dieses Strangs mit Profil + freiem Debug-Port
#
# und öffnet in Herdr einen Tab "<name>" im Worktree mit einer Claude-Instanz.
# Das normale Repo und master bleiben unberührt. Aufräumen: scripts/parallel-ende.sh <name>

set -euo pipefail

NAME="${1:-}"
BASIS="${2:-master}"
HAUPT="$HOME/dev/mindgraph-notes"
WURZEL="$HOME/dev/mindgraph-parallel"
TESTPROFIL="$HOME/dev/mindgraph-test/profil"

if ! [[ "$NAME" =~ ^[a-z][a-z0-9-]{0,31}$ ]]; then
  echo "Aufruf: $0 <name> [basis]   (name: klein, a-z 0-9 -, z.B. faktura-export)" >&2
  exit 2
fi

STRANG="$WURZEL/$NAME"
BRANCH="parallel/$NAME"
REPO="$STRANG/repo"

if [ -e "$STRANG" ]; then
  echo "Strang '$NAME' gibt es schon: $STRANG" >&2
  exit 1
fi
if git -C "$HAUPT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  echo "Branch $BRANCH existiert schon. Anderen Namen wählen oder Branch erst löschen." >&2
  exit 1
fi

mkdir -p "$STRANG"

echo "1/4  Worktree $REPO auf neuem Branch $BRANCH (Basis: $BASIS)"
git -C "$HAUPT" worktree add -q -b "$BRANCH" "$REPO" "$BASIS"

# node_modules als APFS-Klon (copy-on-write): Sekunden statt npm install, belegt
# kaum Platz, und die beiden Stränge teilen sich keinen Vite-Cache.
echo "2/4  node_modules klonen"
if [ -d "$HAUPT/app/node_modules" ]; then
  cp -Rc "$HAUPT/app/node_modules" "$REPO/app/node_modules"
else
  echo "     Kein node_modules im Haupt-Repo — im Strang selbst 'npm install' laufen lassen."
fi

echo "3/4  Eigenes Profil anlegen"
if [ -d "$TESTPROFIL" ]; then
  cp -Rc "$TESTPROFIL" "$STRANG/profil"
  rm -f "$STRANG/profil/SingletonLock" "$STRANG/profil/SingletonCookie" "$STRANG/profil/SingletonSocket"
else
  mkdir -p "$STRANG/profil"
fi

# Freien Debug-Port ab 9230 suchen (9222 = normale Dev-App, 9223 = Testprofil).
PORT=9230
while lsof -nP -iTCP:"$PORT" -sTCP:LISTEN >/dev/null 2>&1; do PORT=$((PORT + 1)); done

cat > "$STRANG/dev.sh" <<EOF
#!/bin/sh
# Dev-App des Strangs '$NAME' — eigenes Profil, Debug-Port $PORT (nur lokal).
cd "$REPO/app" || exit 1
MINDGRAPH_USER_DATA_DIR="$STRANG/profil" exec npx electron-vite dev --remoteDebuggingPort $PORT
EOF
chmod +x "$STRANG/dev.sh"

echo "4/4  Herdr-Tab mit Claude öffnen"
if [ "${HERDR_ENV:-}" = 1 ] && command -v herdr >/dev/null 2>&1; then
  ANTWORT=$(herdr tab create --workspace "$HERDR_WORKSPACE_ID" --cwd "$REPO" --label "$NAME" \
    --env "MINDGRAPH_USER_DATA_DIR=$STRANG/profil" --no-focus)
  TAB_ID=$(printf '%s' "$ANTWORT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["tab"]["tab_id"])')
  PANE_ID=$(printf '%s' "$ANTWORT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["result"]["root_pane"]["pane_id"])')
  printf '%s\n' "$TAB_ID" > "$STRANG/herdr-tab"
  if ! herdr agent start "$NAME" --kind claude --pane "$PANE_ID" >/dev/null; then
    echo "     Tab ist offen, Claude startete nicht automatisch — dort selbst 'claude' eingeben."
  fi
else
  echo "     Nicht in Herdr — selbst öffnen: cd $REPO && claude"
fi

cat <<EOF

Strang '$NAME' steht.
  Ordner:   $REPO
  Branch:   $BRANCH
  Dev-App:  $STRANG/dev.sh   (läuft neben deiner normalen Dev-App)
  Fertig:   Branch nach master mergen, dann scripts/parallel-ende.sh $NAME
EOF
