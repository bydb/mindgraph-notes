// Absichtskatalog. Reine Daten — der Erkenner in match.ts liest nur von hier.
//
// Stufe 1a enthält bewusst NUR die drei gebauten Absichten: je eine Navigation ohne
// Parameter, eine Navigation mit Parameter und eine datenbasierte Antwort. Alles andere
// fällt in den Rückfall (Notizsuche) — das ist das entworfene Verhalten, kein Mangel.
// Weitere Absichten kommen als Daten dazu, nicht als Code.

import type { AppActionId, ActionKind } from './types'

export interface IntentTerm {
  /** Wortstamm; matcht auch Endungen ("überfällig" trifft "überfällige"). */
  word: string
  weight: number
}

export interface IntentDef {
  id: AppActionId
  kind: ActionKind
  /** Volltreffer-Muster. Ein Treffer ergibt 1.0. Benannte Gruppen füllen Parameter. */
  patterns: RegExp[]
  /** Teiltreffer. Gewichte addieren sich auf einen Sockel, siehe match.ts. */
  terms: IntentTerm[]
  /** Für den Prototyp-Test: Formulierungen, die treffen MÜSSEN. */
  examples: string[]
}

export const INTENTS: IntentDef[] = [
  {
    id: 'view.dashboard',
    kind: 'navigate',
    patterns: [
      /\b(öffne|offne|zeige?|starte|open|show)\b[^.]*\bdashboard\b/u,
      /^dashboard$/u,
      /\bdashboard\b\s+(öffnen|anzeigen|open)\b/u
    ],
    terms: [
      { word: 'dashboard', weight: 0.5 },
      { word: 'übersicht', weight: 0.25 },
      { word: 'overview', weight: 0.25 }
    ],
    examples: [
      'öffne das dashboard',
      'zeig mir das dashboard',
      'dashboard',
      'dashboard öffnen',
      'starte das dashboard',
      'open the dashboard',
      'show the dashboard',
      'dashboard open'
    ]
  },
  {
    id: 'tasks.overdue',
    kind: 'answer',
    patterns: [
      /\büberfällig/u,
      /\boverdue\b/u,
      /\bwelche aufgaben sind (noch )?(offen|fällig)\b/u,
      /\bwas ist (noch )?fällig\b/u
    ],
    terms: [
      { word: 'überfällig', weight: 0.5 },
      { word: 'overdue', weight: 0.5 },
      { word: 'fällig', weight: 0.35 },
      { word: 'aufgabe', weight: 0.2 },
      { word: 'task', weight: 0.2 }
    ],
    examples: [
      'was ist überfällig',
      'welche aufgaben sind überfällig',
      'zeig mir die überfälligen aufgaben',
      'überfällige aufgaben',
      'was ist noch fällig',
      'what is overdue',
      'show overdue tasks',
      'overdue'
    ]
  },
  {
    id: 'briefing.today',
    kind: 'answer',
    patterns: [
      /\bwas ist (heute|jetzt|gerade) wichtig\b/u,
      /\b(tages)?briefing\b/u,
      /\bwie sieht mein tag aus\b/u,
      /\bworauf (soll|sollte) ich (mich )?(heute )?konzentrieren\b/u,
      /\bwas ist wichtig\b/u,
      /\bwhat( is| s)? important today\b/u,
      /\b(daily )?briefing\b/u,
      /\bhow does my day look\b/u
    ],
    terms: [
      { word: 'briefing', weight: 0.5 },
      { word: 'wichtig', weight: 0.35 },
      { word: 'tagesueberblick', weight: 0.5 }
    ],
    examples: [
      'was ist heute wichtig',
      'tagesbriefing',
      'briefing',
      'wie sieht mein tag aus',
      'worauf soll ich mich heute konzentrieren',
      'what is important today',
      'daily briefing',
      'how does my day look'
    ]
  },
  {
    id: 'note.create',
    kind: 'navigate',
    patterns: [
      /\b(öffne|offne|erstelle|erstell|leg|lege|mach|starte)\b[^.]*\bneue\w? notiz\b/u,
      /\bneue notiz\b/u,
      /\bnotiz (anlegen|erstellen|hinzufügen)\b/u,
      /\b(new|create) note\b/u,
      /\bschnellnotiz\b/u
    ],
    terms: [
      { word: 'schnellnotiz', weight: 0.5 },
      { word: 'anlegen', weight: 0.3 }
    ],
    examples: [
      'öffne eine neue notiz',
      'neue notiz',
      'erstelle eine neue notiz',
      'notiz anlegen',
      'leg eine neue notiz an',
      'new note',
      'create note',
      'schnellnotiz'
    ]
  },
  {
    id: 'tasks.today',
    kind: 'answer',
    patterns: [
      // Bewusst tolerant im Hauptwort: Whisper verhört sich im Deutschen genau dort
      // ("Welche Tutus habe ich heute noch?" statt "Todos"). Satzbau und Zeitbezug
      // tragen die Bedeutung, nicht das eine Nomen.
      /\bwelche\w* \p{L}+ (habe|hab) ich heute\b/u,
      /\bwas (habe|hab) ich heute (noch )?(zu tun|vor|offen)\b/u,
      /\bwas (liegt|steht) heute (noch )?an\b/u,
      /\bheute (noch )?(zu tun|offen|zu erledigen)\b/u,
      /\bwhat( is| s)? (still )?(due|open) today\b/u,
      /\bmy (tasks|todos) (for )?today\b/u
    ],
    terms: [
      { word: 'todo', weight: 0.45 },
      { word: 'anstehend', weight: 0.3 },
      // Niedrig gehalten: "heute" allein trägt keine Absicht — es steckt auch in
      // "was ist heute wichtig", was zum Tagesbriefing gehört und nicht hierher.
      // 0.30 + 0.10 = 0.40 bleibt unter CLARIFY_MIN_SCORE. Die Muster tragen die Arbeit.
      { word: 'heute', weight: 0.1 }
    ],
    examples: [
      'welche todos habe ich heute noch',
      'was liegt heute noch an',
      'was habe ich heute noch zu tun',
      'was steht heute an',
      'welche aufgaben habe ich heute',
      'what is still due today',
      'my tasks today',
      'what is open today'
    ]
  },
  {
    // Effizienzindex. „mindgraph" ist ein Füllwort und wird vor dem Vergleich entfernt
    // (match.ts) — die Muster dürfen es deshalb nicht verlangen.
    id: 'activity.today',
    kind: 'answer',
    patterns: [
      /\b(heute|bisher) (übernommen|erledigt|geschafft|gespart)\b/u,
      /\bzeit(ersparnis|gewinn)\b/u,
      /\bzeit\b[^.]*\bgespart\b/u,
      /\btagesbilanz\b/u,
      /\bwas hat (der agent|die app) (heute )?(gemacht|getan)\b/u,
      /\bwhat did (you|the agent) do today\b/u,
      /\btime\b[^.]*\bsaved?\b/u,
      /\bactivity today\b/u
    ],
    terms: [
      { word: 'zeitersparnis', weight: 0.5 },
      { word: 'tagesbilanz', weight: 0.5 },
      { word: 'übernommen', weight: 0.45 },
      { word: 'gespart', weight: 0.45 },
      { word: 'bilanz', weight: 0.35 },
      { word: 'geschafft', weight: 0.3 }
    ],
    examples: [
      'was hat mindgraph heute übernommen',
      'was wurde heute erledigt',
      'wie viel zeit habe ich heute gespart',
      'zeitersparnis',
      'tagesbilanz',
      'was hat der agent heute gemacht',
      'what did you do today',
      'how much time did i save today',
      'activity today'
    ]
  },
  {
    id: 'search.notes',
    kind: 'navigate',
    patterns: [
      // Der Suchbegriff steht IMMER am Ende — deshalb greedy bis zum Satzende.
      /\b(suche|such|finde|find|search)\b\s+(?:nach\s+|for\s+)?(?<query>.+)$/u,
      /\b(?<query>.+?)\s+(suchen|finden)$/u
    ],
    terms: [
      { word: 'suche', weight: 0.4 },
      { word: 'suchen', weight: 0.4 },
      { word: 'finde', weight: 0.4 },
      { word: 'search', weight: 0.4 },
      { word: 'find', weight: 0.4 },
      // Bewusst niedrig: 0.30 + 0.10 = 0.40 liegt eindeutig unter CLARIFY_MIN_SCORE.
      // Bei 0.15 landete der Wert exakt auf der Schwelle und nur die Fließkomma-
      // Rundung entschied, ob "erstelle eine neue Notiz" eine Rückfrage auslöst.
      { word: 'notiz', weight: 0.1 }
    ],
    examples: [
      'suche nach lieferantenvertrag',
      'such lieferant müller',
      'finde die notiz zum angebot',
      'suche angebot 2026',
      'lieferantenvertrag suchen',
      'search for supplier contract',
      'find the offer note',
      'search budget'
    ]
  }
]

export const INTENT_BY_ID = new Map<AppActionId, IntentDef>(INTENTS.map(i => [i.id, i]))
