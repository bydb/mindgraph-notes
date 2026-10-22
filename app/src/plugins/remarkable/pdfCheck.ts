// Plausibilitätsprüfung für PDFs, die das reMarkable-Gerät liefert, bevor sie im Vault landen.
//
// Das ist KEIN Vollständigkeitsbeweis: ein formal sauberes PDF kann trotzdem einen älteren
// Stand zeigen. Es fängt aber abgeschnittene Übertragungen und Fehlerseiten ab, und die
// Seitenzahl wird dem Nutzer gezeigt — dort kann er mit dem Gerät vergleichen.

const PDF_HEADER = '%PDF-'
const PDF_EOF = '%%EOF'
/** Hinter %%EOF dürfen noch Leerzeichen/Zeilenenden stehen; 1024 Bytes ist die übliche Leser-Toleranz. */
const EOF_WINDOW = 1024

function asciiSlice(bytes: Uint8Array, start: number, end: number): string {
  let out = ''
  for (let i = Math.max(0, start); i < Math.min(bytes.length, end); i++) out += String.fromCharCode(bytes[i])
  return out
}

/** Liefert einen Grund, wenn die Bytes kein vollständiges PDF sein können, sonst null. */
export function pdfStructureProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'Das Gerät hat eine leere Datei geliefert.'
  if (!asciiSlice(bytes, 0, 1024).includes(PDF_HEADER)) return 'Das Gerät hat kein PDF geliefert.'
  if (!asciiSlice(bytes, bytes.length - EOF_WINDOW, bytes.length).includes(PDF_EOF)) {
    return 'Das PDF vom Gerät ist unvollständig (Dateiende fehlt) — vermutlich wurde die Übertragung abgebrochen.'
  }
  return null
}

/** Seitenzahl über pdfjs. Wirft, wenn pdfjs das Dokument nicht öffnen kann. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const pdfjs: typeof import('pdfjs-dist') = await import('pdfjs-dist/legacy/build/pdf.mjs')
  // Kopie übergeben: pdfjs darf den Puffer übernehmen, die Bytes werden danach noch geschrieben.
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false }).promise
  try {
    return doc.numPages
  } finally {
    await doc.destroy()
  }
}

export function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/**
 * Ein von der Importnotiz übernommener PDF-Pfad (`sourcePdf`) darf wiederverwendet werden,
 * wenn er ein relativer Vault-Pfad auf eine .pdf ist und nicht in `.mindgraph` zeigt.
 */
export function isReusablePdfPath(rel: unknown): rel is string {
  if (typeof rel !== 'string' || rel.length === 0) return false
  if (!rel.toLowerCase().endsWith('.pdf')) return false
  if (rel.startsWith('/') || rel.includes('\\') || /^[a-zA-Z]:/.test(rel)) return false
  const parts = rel.split('/')
  if (parts.some((p) => p === '..' || p === '' || p === '.')) return false
  if (parts[0] === '.mindgraph') return false
  return true
}
