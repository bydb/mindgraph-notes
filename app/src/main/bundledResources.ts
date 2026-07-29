// Auflösung des gebündelten `app/resources`-Baums — eine Stelle, weil genau
// hier schon zweimal derselbe Fehler entstanden ist.
//
// Im gepackten Build liegt der Baum ZWEIMAL vor:
//
//   1. in `app.asar`, weil `build.files` `resources/**/*` einschließt
//      -> erreichbar über `path.join(__dirname, '../../resources')`
//   2. daneben als echtes Verzeichnis, weil `build.extraResources` ihn mit
//      `{ from: 'resources', to: 'resources' }` kopiert
//      -> erreichbar über `path.join(process.resourcesPath, 'resources')`
//
// Der Unterordner `resources` in Variante 2 gehört zwingend dazu. Ohne ihn
// zeigt der Pfad auf `Contents/Resources/` — dort liegen nur app.asar, die
// Chromium-Sprachdateien und CHANGELOG.md. Genau dieser fehlende Teil hat in
// jedem gepackten Build die Starter-Vaults und die Starter-Skills lahmgelegt
// (`ENOENT ... scandir '.../Contents/Resources/starter-skills'`).
//
// Diese Funktion liefert Variante 2, das echte Verzeichnis. Für alles, was
// kopiert wird, ist das die richtige Wahl: `fs.copyFile` aus dem Asar-Archiv
// heraus ist unzuverlässig (siehe Kommentar in `noteAgent/htmlAssets.ts`, das
// deshalb bewusst readFile+writeFile nutzt).
//
// Rein lesende Zugriffe, die schon über `__dirname` auf das Asar zeigen
// (Fenster-Icon, Transport-Fenster, KaTeX-Assets), bleiben wie sie sind — sie
// funktionieren und brauchen `extraResources` nicht.

import { app } from 'electron'
import * as path from 'path'

export function bundledResourcesDir(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'resources')
    : path.join(app.getAppPath(), 'resources')
}
