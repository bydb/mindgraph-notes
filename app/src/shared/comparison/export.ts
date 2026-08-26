// Export einer Kampagne (docs/comparison-mode-plan.md, Abschnitt 9).
//
// Der Bericht geht aus der App heraus — er muss ohne sie verständlich sein UND seine
// eigenen Grenzen benennen. Drei Regeln, die hier wichtiger sind als die Formatierung:
//
//  1. Kein Freitext des Nutzers. Fälle heißen „Fall 3", nicht „Angebot Müller".
//  2. Jede Zeit trägt ihre Herkunft. „Gemessen" und „gestoppt" dürfen nie zu einer Zahl
//     verschmelzen.
//  3. Keine Kennzahl unterhalb der Mindestfallzahl, und keine Schlussfolgerung. Der
//     Bericht sagt, was gemessen wurde — nicht, was daraus folgt.

import { armStats, totalActiveMs, type ArmStats } from './metrics'
import type { Campaign, ComparisonCase, Quality, TimeOrigin } from './types'
import { MIN_CASES_PER_ARM } from './types'

export interface ExportLabels {
  arm: Record<'konventionell' | 'mindgraph', string>
  state: Record<ComparisonCase['state'], string>
  quality: Record<Quality, string>
  origin: Record<TimeOrigin, string>
}

function minutes(ms: number | null): string {
  if (ms === null) return '—'
  return String(Math.round(ms / 60_000))
}

/** Herkünfte eines Falls, ohne Dopplung — die Spalte „Grundlage" im Bericht. */
function originsOf(c: ComparisonCase, labels: ExportLabels): string {
  const gesehen: TimeOrigin[] = []
  for (const s of c.sessions) if (!gesehen.includes(s.origin)) gesehen.push(s.origin)
  return gesehen.map(o => labels.origin[o]).join(', ') || '—'
}

/** Fälle bekommen laufende Nummern statt ihrer Kurzbezeichnung — die bleibt lokal. */
function numbering(cases: readonly ComparisonCase[]): Map<string, number> {
  const sortiert = [...cases].sort((a, b) => a.createdAt - b.createdAt)
  return new Map(sortiert.map((c, i) => [c.id, i + 1]))
}

export function toCsv(campaign: Campaign, cases: readonly ComparisonCase[], labels: ExportLabels): string {
  const eigene = cases.filter(c => c.campaignId === campaign.id)
  const nr = numbering(eigene)
  const kopf = ['Fall', 'Weg', 'Zustand', 'Grund', 'Aktive Zeit (min)', 'Grundlage', 'Uebernommen', 'Qualitaet']
  const zeilen = [...eigene]
    .sort((a, b) => (nr.get(a.id) ?? 0) - (nr.get(b.id) ?? 0))
    .map(c => [
      `Fall ${nr.get(c.id)}`,
      labels.arm[c.arm],
      labels.state[c.state],
      c.stateReason ?? '',
      minutes(totalActiveMs(c)),
      originsOf(c, labels),
      c.accepted === undefined ? '' : c.accepted ? 'ja' : 'nein',
      c.quality ? labels.quality[c.quality] : ''
    ])
  const escape = (feld: string): string => (/[";\n]/.test(feld) ? `"${feld.replace(/"/g, '""')}"` : feld)
  return [kopf, ...zeilen].map(z => z.map(escape).join(';')).join('\n')
}

function armBlock(s: ArmStats, labels: ExportLabels): string[] {
  return [
    `### ${labels.arm[s.arm]}`,
    '',
    `- Zugeteilt: ${s.assigned} · abgeschlossen: ${s.completed} · abgebrochen: ${s.aborted} · nicht messbar: ${s.notMeasurable} · offen: ${s.open}`,
    `- Median der gesamtaktiven Zeit: ${minutes(s.medianTotalActiveMs)} min`,
    `- Streuung (Quartilsabstand): ${minutes(s.iqrTotalActiveMs)} min`,
    s.acceptedOfCompleted !== null ? `- Ergebnis übernommen: ${s.acceptedOfCompleted} von ${s.completed}` : null,
    `- Qualität: ${([1, 2, 3, 4] as Quality[]).map(q => `${s.qualityCounts[q]}× ${labels.quality[q]}`).join(' · ')}`,
    ''
  ].filter((z): z is string => z !== null)
}

export function toMarkdown(
  campaign: Campaign,
  cases: readonly ComparisonCase[],
  labels: ExportLabels,
  now: number
): string {
  const eigene = cases.filter(c => c.campaignId === campaign.id)
  const nr = numbering(eigene)
  const arme = [armStats(eigene, 'konventionell'), armStats(eigene, 'mindgraph')]
  const vergleichbar = arme.every(a => a.missingForMetrics === 0)
  const datum = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

  const zeilen: string[] = [
    `# Vergleich: ${campaign.taskClass}`,
    '',
    `Zeitraum: ${datum(campaign.startedAt)} bis ${campaign.endedAt ? datum(campaign.endedAt) : 'laufend'} · Bericht vom ${datum(now)}`,
    '',
    '## Anlage',
    '',
    `- Aufgabenklasse: ${campaign.taskClass}`,
    `- Einschlussregeln: ${campaign.inclusionRules || '—'}`,
    `- Brauchbar ist: ${campaign.acceptanceDefinition}`,
    `- Zuteilung: ${campaign.randomization.method} (Wahrscheinlichkeit ${campaign.randomization.bias.toFixed(2)} für den zurückliegenden Weg), von der App gezogen — nicht vom Bearbeiter gewählt`,
    `- Protokollversion: ${campaign.protocolVersion}`,
    '',
    '## Ergebnis',
    ''
  ]

  if (!vergleichbar) {
    // Lieber keine Zahl als eine, die aussieht wie ein Ergebnis.
    zeilen.push(
      `**Noch keine belastbare Kennzahl.** Es braucht mindestens ${MIN_CASES_PER_ARM} abgeschlossene Fälle je Weg;`,
      `es fehlen ${arme.reduce((sum, a) => sum + a.missingForMetrics, 0)}. Die Einzelfälle stehen unten.`,
      ''
    )
  }

  for (const a of arme) zeilen.push(...armBlock(a, labels))

  zeilen.push(
    '## Fälle',
    '',
    '| Fall | Weg | Zustand | Aktive Zeit | Grundlage | Übernommen | Qualität |',
    '|---|---|---|---|---|---|---|'
  )
  for (const c of [...eigene].sort((a, b) => (nr.get(a.id) ?? 0) - (nr.get(b.id) ?? 0))) {
    zeilen.push([
      `Fall ${nr.get(c.id)}`,
      labels.arm[c.arm],
      labels.state[c.state] + (c.stateReason ? ` (${c.stateReason})` : ''),
      `${minutes(totalActiveMs(c))} min`,
      originsOf(c, labels),
      c.accepted === undefined ? '—' : c.accepted ? 'ja' : 'nein',
      c.quality ? labels.quality[c.quality] : '—'
    ].join(' | ').replace(/^/, '| ').replace(/$/, ' |'))
  }

  zeilen.push(
    '',
    '## Was diese Zahlen sind — und was nicht',
    '',
    '- **Gesamtaktive Zeit je Fall**, einschließlich der Arbeit, die nach einem verworfenen Ergebnis von Hand nötig war. Ein Fehlschlag wird damit nicht billiger, sondern teurer.',
    '- **Ausgewertet wird nach Zuteilung**, nicht danach, welches Werkzeug am Ende benutzt wurde.',
    '- **Zeiten des konventionellen Wegs sind gestoppt oder nachgetragen, nicht gemessen.** Excel, Outlook und der Dateimanager reden nicht mit MindGraph. Die Spalte „Grundlage" nennt für jeden Fall, worauf seine Zahl beruht.',
    '- **Die Qualitätsbewertung ist nicht verblindet**: Wer weiß, welchen Weg er gegangen ist, bewertet nicht neutral.',
    '- **Median statt Mittelwert**, weil bei diesen Fallzahlen ein Ausreißer den Schnitt regiert. Keine Signifikanztests — dafür sind es zu wenige Fälle.',
    '- Alle zugeteilten Fälle stehen im Nenner, auch abgebrochene und nicht messbare.',
    ''
  )

  return zeilen.join('\n')
}
