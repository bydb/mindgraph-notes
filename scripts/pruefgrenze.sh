#!/usr/bin/env bash
# Grenzkontrolle für die Herdr-Prüfschleife (docs/codex-collab/README.md).
#
# Der Prüfer läuft mit Schreibrecht im Arbeitsbaum, darf aber nur die Aufgabendatei
# anfassen. Dieses Skript macht diese Behauptung überprüfbar: einmal VOR dem Lauf
# aufrufen, einmal DANACH.
#
#   scripts/pruefgrenze.sh vorher  docs/codex-collab/<thema>.md
#   scripts/pruefgrenze.sh nachher docs/codex-collab/<thema>.md
#
# Exit 0 = Grenze gehalten und Findings sind gewachsen
# Exit 1 = Grenze verletzt oder Lauf ohne Ergebnis  -> anhalten, dem Nutzer melden
# Exit 2 = Bedienfehler
#
# Was es NICHT leistet: Es hält keinen bösartigen Prüfer auf, der das Skript selbst
# verändert. Es fängt Unfälle und macht "nur die Aufgabendatei" zu einer Aussage, die
# man nachmessen kann — nicht zu einer Zusage, auf die man sich blind verlässt.

set -euo pipefail

MODUS="${1:-}"
ZIEL="${2:-}"

if [ "$MODUS" != "vorher" ] && [ "$MODUS" != "nachher" ]; then
  echo "Aufruf: $0 vorher|nachher <aufgabendatei>" >&2
  exit 2
fi
if [ -z "$ZIEL" ]; then
  echo "Fehlende Aufgabendatei." >&2
  exit 2
fi

# Repo-Wurzel ist der Bezugspunkt für alles Weitere — nie das aktuelle Verzeichnis.
WURZEL="$(git rev-parse --show-toplevel)"
cd "$WURZEL"

ABS="$(cd "$(dirname "$ZIEL")" && pwd)/$(basename "$ZIEL")"
case "$ABS" in
  "$WURZEL"/*) REL="${ABS#"$WURZEL"/}" ;;
  *) echo "Aufgabendatei liegt außerhalb des Repos: $ABS" >&2; exit 2 ;;
esac

# Ignorierte Pfade, die git nicht meldet, die aber Verhalten steuern.
IGNORIERT=(".claude")

SCHLUESSEL="$(printf '%s' "$WURZEL/$REL" | shasum | cut -c1-16)"
SNAP="${TMPDIR:-/tmp}/pruefgrenze-$SCHLUESSEL"

hashliste() {
  # 1) Inhalt aller getrackten Änderungen gegen HEAD, ohne die Aufgabendatei.
  #    Fängt auch Dateien, die schon vor dem Lauf als geändert geführt wurden.
  git diff HEAD -- . ":(exclude)$REL" | shasum | awk '{print "getrackt " $1}'

  # 2) Jede unversionierte, nicht ignorierte Datei einzeln, ohne die Aufgabendatei.
  git ls-files --others --exclude-standard -z \
    | while IFS= read -r -d '' f; do
        [ "$f" = "$REL" ] && continue
        printf 'neu %s %s\n' "$(shasum "$f" | cut -d' ' -f1)" "$f"
      done | sort

  # 3) Ignorierte Steuerpfade, die in (1) und (2) grundsätzlich nicht auftauchen.
  for p in "${IGNORIERT[@]}"; do
    [ -e "$p" ] || continue
    find "$p" -type f -print0 \
      | while IFS= read -r -d '' f; do
          printf 'ignoriert %s %s\n' "$(shasum "$f" | cut -d' ' -f1)" "$f"
        done | sort
  done
}

# Der Findings-Abschnitt der Aufgabendatei: von "## Codex-Findings" bis zur nächsten H2.
findings_abschnitt() {
  [ -f "$REL" ] || return 0
  awk '/^## Codex-Findings/{drin=1; next} /^## /{drin=0} drin' "$REL"
}

if [ "$MODUS" = "vorher" ]; then
  mkdir -p "$SNAP"
  hashliste > "$SNAP/baum"
  findings_abschnitt | shasum | cut -d' ' -f1 > "$SNAP/findings-hash"
  findings_abschnitt | grep -c '^### F[0-9][0-9]' > "$SNAP/findings-anzahl" || true
  git rev-parse HEAD > "$SNAP/head"
  date "+%Y-%m-%d %H:%M:%S" > "$SNAP/zeit"
  echo "Vorzustand festgehalten: $SNAP"
  echo "  Aufgabendatei: $REL"
  echo "  Findings vorher: $(cat "$SNAP/findings-anzahl")"
  exit 0
fi

# --- nachher ---
if [ ! -f "$SNAP/baum" ]; then
  echo "FEHLER: kein Vorzustand für $REL. Vor dem Lauf 'pruefgrenze.sh vorher' aufrufen." >&2
  exit 1
fi

status=0

if ! hashliste > "$SNAP/baum-nachher" || ! diff -q "$SNAP/baum" "$SNAP/baum-nachher" >/dev/null; then
  echo "GRENZE VERLETZT — außerhalb der Aufgabendatei hat sich etwas geändert:"
  diff "$SNAP/baum" "$SNAP/baum-nachher" | sed 's/^/  /' || true
  status=1
fi

if [ "$(git rev-parse HEAD)" != "$(cat "$SNAP/head")" ]; then
  echo "GRENZE VERLETZT — HEAD hat sich bewegt (Commit während des Laufs)."
  status=1
fi

# F01: Ein Lauf ohne neue Findings ist ein Fehlschlag, kein leeres Ergebnis.
# Die Aufgabendatei wird direkt gelesen, nie über 'git diff' — sie ist im Erstlauf
# unversioniert, und darauf gibt 'git diff' stillschweigend null Zeilen aus.
neu_hash="$(findings_abschnitt | shasum | cut -d' ' -f1)"
neu_anzahl="$(findings_abschnitt | grep -c '^### F[0-9][0-9]' || true)"
alt_anzahl="$(cat "$SNAP/findings-anzahl")"

if [ "$neu_hash" = "$(cat "$SNAP/findings-hash")" ]; then
  echo "KEIN ERGEBNIS — der Findings-Abschnitt in $REL ist unverändert."
  echo "  Der Lauf gilt als fehlgeschlagen. Nicht die alten Findings als Ergebnis lesen."
  status=1
elif [ "$neu_anzahl" -le "$alt_anzahl" ] && ! findings_abschnitt | grep -q 'keine Findings'; then
  echo "VERDÄCHTIG — Abschnitt geändert, aber nicht mehr Findings als vorher ($alt_anzahl -> $neu_anzahl)."
  echo "  Abschnitt von Hand ansehen, bevor du ihn verwendest."
  status=1
fi

if [ "$status" -eq 0 ]; then
  echo "Grenze gehalten. Nur $REL wurde geschrieben."
  echo "  Findings: $alt_anzahl -> $neu_anzahl"
fi
exit "$status"
