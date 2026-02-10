Erstelle ein neues Release für MindGraph Notes. Führe folgende Schritte der Reihe nach aus:

## 1. Versionsnummer bestimmen
- Lies die aktuelle Version aus `app/package.json`
- Erhöhe die Patch-Version (z.B. 1.0.23 → 1.0.24), behalte das `-beta` Suffix
- Falls der User eine spezifische Version angegeben hat, nutze diese: $ARGUMENTS

## 2. Version bumpen
- Aktualisiere die Version in `app/package.json`

## 3. Website aktualisieren
- Ersetze alle Vorkommen der alten Version in `docs/index.html` (Download-Links, softwareVersion etc.)

## 4. Build prüfen
- Führe `npx electron-vite build` im `app/` Verzeichnis aus um sicherzustellen, dass alles kompiliert

## 5. Changelog erstellen
- Lies die Commits seit dem letzten Tag: `git log $(git describe --tags --abbrev=0)..HEAD --oneline`
- Erstelle daraus einen strukturierten Changelog mit Kategorien (New Features, Bug Fixes, Improvements)

## 6. Commit und Push
- Stage alle geänderten Dateien (package.json, docs/index.html, und alle weiteren geänderten Dateien)
- Erstelle einen Commit mit der Nachricht: "Bump version to X.X.XX-beta"
- Push auf `master`

## 7. Tag erstellen und pushen
- `git tag vX.X.XX-beta`
- `git push origin vX.X.XX-beta`
- Dies triggert die GitHub Actions Builds für macOS (arm64+x64), Linux (AppImage+deb), Windows (exe)

## 8. GitHub Release erstellen
- Erstelle ein GitHub Release mit `gh release create` und dem Changelog als Body
- Nutze `--prerelease` Flag

## 9. Zusammenfassung
- Zeige die Release-URL
- Weise darauf hin, dass die Builds in GitHub Actions laufen und die Assets automatisch zum Release hinzugefügt werden
