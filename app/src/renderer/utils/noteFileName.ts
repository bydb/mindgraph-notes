/**
 * Freien Dateinamen für eine neue Notiz finden (Codex F40): jeder Kandidat — Basisname und
 * `(2)` bis `(max)` — wird VOR der Wahl geprüft; ist alles belegt, gibt es null statt eines
 * ungeprüften letzten Kandidaten, der eine bestehende Notiz überschrieben hätte.
 */
export async function reserveFreeNoteName(
  base: string,
  exists: (fileName: string) => Promise<boolean>,
  max = 20
): Promise<string | null> {
  for (let attempt = 1; attempt <= max; attempt++) {
    const candidate = attempt === 1 ? `${base}.md` : `${base} (${attempt}).md`
    if (!(await exists(candidate))) return candidate
  }
  return null
}
