// Versionierter Testkorpus für den Skill-Benchmark des Notiz-Agenten.
// Alle Namen und Inhalte sind synthetisch. Die Validatoren arbeiten deterministisch
// und benötigen keinen zweiten LLM-Aufruf als Judge.

const lower = value => String(value ?? '').toLocaleLowerCase('de')

function writerArgs(run) {
  return run.artifacts[0]?.args ?? {}
}

function markdownOf(run) {
  const args = writerArgs(run)
  return String(args.markdown ?? '')
}

function htmlOf(run) {
  return String(writerArgs(run).body_html ?? '')
}

function xlsxOf(run) {
  const args = writerArgs(run)
  return {
    columns: Array.isArray(args.columns) ? args.columns.map(String) : [],
    rows: Array.isArray(args.rows)
      ? args.rows.map(row => Array.isArray(row) ? row.map(value => String(value ?? '')) : [])
      : []
  }
}

function includesAll(text, values) {
  const haystack = lower(text)
  return values.every(value => haystack.includes(lower(value)))
}

function wordCount(text) {
  return String(text).trim().split(/\s+/u).filter(Boolean).length
}

function validateElternbrief(run) {
  const text = markdownOf(run)
  const errors = []
  if (!includesAll(text, ['Donnerstag', '8. Oktober 2026', '7,50', 'Nordtor'])) {
    errors.push('Termin, Kosten oder Treffpunkt aus der Quelle fehlen')
  }
  if (!/\bSie\b/.test(text)) errors.push('förmliche Sie-Anrede fehlt')
  if (!includesAll(text, ['Name des Kindes', 'Klasse', 'Unterschrift']) || !/(?:☐|\[\s?\]).*(?:teilnehmen|Teilnahme)/is.test(text)) {
    errors.push('abtrennbarer Rückmeldeabschnitt mit Ankreuzoptionen fehlt')
  }
  if (/Schüler[:*_]innen|Eltern[:*_]teile/i.test(text)) errors.push('Gender-Sonderzeichen verwendet')
  if (wordCount(text) > 650) errors.push('Elternbrief ist deutlich länger als eine Seite')
  return errors
}

function validateProtokoll(run) {
  const text = markdownOf(run)
  const errors = []
  if (!includesAll(text, ['TOP 1', 'TOP 2', 'Beschluss', 'Diskussion'])) {
    errors.push('TOP-Gliederung oder Trennung von Diskussion und Beschluss fehlt')
  }
  if (!includesAll(text, [
    'Aufgabe',
    'Verantwortlich',
    'Frist',
    'Lea Winter',
    '22. September 2026',
    'Omar Voss',
    '18. September 2026',
    '5. November 2026',
    '1. Oktober 2026'
  ])) {
    errors.push('Aufgabenübersicht ist unvollständig')
  }
  if (!/offen/i.test(text)) errors.push('fehlende Protokollführung ist nicht als offen markiert')
  return errors
}

function validateZusammenfassung(run) {
  const text = markdownOf(run)
  const errors = []
  if (!includesAll(text, ['18,75', '4. November 2026', 'Nora Feld', 'offen'])) {
    errors.push('exakte Zahl, Datum, Name oder offener Punkt fehlt')
  }
  if (!/^\s*[-*]\s+/m.test(text)) errors.push('Stichpunktliste fehlt')
  if (/20 Prozent|rund 19|abschließend genehmigt/i.test(text)) {
    errors.push('Quelle wurde gerundet oder um nicht belegte Aussagen ergänzt')
  }
  if (wordCount(text) > 50) errors.push('Zusammenfassung überschreitet ungefähr ein Drittel der Quelle')
  return errors
}

function validateLiteraturnotiz(run) {
  const text = markdownOf(run)
  const errors = []
  if (!includesAll(text, [
    'Mara König',
    '2024',
    'Lokale Sprachmodelle in Schulen',
    'Zeitschrift für Digitale Bildung',
    'Kernaussage',
    'Argumente und Befunde',
    'Methode',
    'Einordnung',
    'n = 128',
    '14,6',
    'S. 37'
  ])) {
    errors.push('Quellenangabe, Pflichtabschnitt oder exakter Befund fehlt')
  }
  if (/15 Prozent|signifikant|repräsentativ/i.test(text)) {
    errors.push('Befund wurde gerundet oder durch unbelegte Wertung ergänzt')
  }
  return errors
}

function validateWebseitenArtikel(run) {
  const text = markdownOf(run)
  const errors = []
  const words = wordCount(text.replace(/^---[\s\S]*?---/m, ''))
  if (!/^---[\s\S]*?\btitle\s*:[\s\S]*?\bdate\s*:[\s\S]*?\bsummary\s*:[\s\S]*?\bstatus\s*:\s*draft[\s\S]*?---/i.test(text)) {
    errors.push('Frontmatter mit title/date/summary/status: draft fehlt')
  }
  if (words < 300 || words > 600) errors.push(`Artikellänge liegt mit ${words} Wörtern außerhalb 300–600`)
  if (!includesAll(text, [
    'Dienstag',
    '17. November 2026',
    'Transparenzhinweis',
    'Unterstützung künstlicher Intelligenz',
    '[Name, Funktion]',
    'redaktionell geprüft',
    'Freigabe'
  ])) {
    errors.push('Datum oder vorgeschriebener Transparenzhinweis fehlt')
  }
  if (/Mila Hartmann/i.test(text)) errors.push('Name einer Minderjährigen trotz fehlender Einwilligung übernommen')
  return errors
}

function validateWissenschaftlicheWebseite(run) {
  const args = writerArgs(run)
  const html = htmlOf(run)
  const errors = []
  if (!String(args.file_name ?? '').toLowerCase().endsWith('.html')) errors.push('Dateiendung .html fehlt')
  if (!String(args.title ?? '').trim()) errors.push('title fehlt')
  if (/<\/?(?:html|head|body)\b|<h1\b/i.test(html)) errors.push('body_html enthält Dokumentgerüst oder h1')
  if (!includesAll(html, [
    'class="abstract"',
    '<section',
    '1&nbsp;&nbsp;',
    'class="equation"',
    '<svg',
    'viewBox',
    'var(--fig-line)',
    '<text',
    'class="references"',
    'Literatur'
  ])) {
    errors.push('wissenschaftliche Pflichtbausteine, Formel, SVG oder Literatur fehlen')
  }
  if (/<svg\b[^>]*(?:width|height)=/i.test(html)) errors.push('SVG enthält verbotene width/height-Attribute')
  if (/points="[^"]*;/i.test(html)) errors.push('SVG-points enthalten Semikolons')
  if (/#(?:[0-9a-f]{3}|[0-9a-f]{6})\b|rgb\(/i.test(html)) errors.push('SVG nutzt feste Farben statt CSS-Variablen')
  return errors
}

function validateTeilnehmerliste(run) {
  const { columns, rows } = xlsxOf(run)
  const errors = []
  const normalizedColumns = columns.map(lower)
  const firstColumnOkay = /lauf|nummer|^nr\.?$/.test(normalizedColumns[0] ?? '')
  const remainingColumnsOkay = ['name', 'vorname', 'schule', 'unterschrift']
    .every((value, index) => normalizedColumns[index + 1]?.includes(value))
  if (!firstColumnOkay || !remainingColumnsOkay) {
    errors.push('Standardspalten stehen nicht in der vorgeschriebenen Reihenfolge')
  }
  if (normalizedColumns.some(column => column.includes('mail') || column.includes('telefon'))) {
    errors.push('nicht benötigte Kontaktdaten wurden übernommen')
  }
  if (rows.length !== 3) errors.push(`erwartet 3 bereinigte Personen, erhalten ${rows.length}`)
  const names = rows.map(row => `${row[1] ?? ''}|${row[2] ?? ''}`)
  if (names.join(';') !== 'Adler|Ben;Kern|Ada;Zorn|Mina') {
    errors.push('Personen sind nicht nach Name/Vorname sortiert oder Dubletten nicht bereinigt')
  }
  if (rows.some(row => String(row[columns.length - 1] ?? '').trim())) {
    errors.push('Unterschriftenspalte ist nicht leer')
  }
  if (!/\b3\b/.test(run.finalText) || !/dublett|zusammengeführt/i.test(run.finalText)) {
    errors.push('Abschlussantwort nennt Anzahl und Dublettenbereinigung nicht')
  }
  return errors
}

function validateTabellenZuordnung(run) {
  const { columns, rows } = xlsxOf(run)
  const errors = []
  if (!includesAll(columns.join(' '), ['Kurs-ID', 'Kurs', 'Raum'])) {
    errors.push('Zielspalten Kurs-ID, Kurs und Raum fehlen')
  }
  const flattened = rows.map(row => row.join('|'))
  if (rows.length !== 4) errors.push(`erwartet 4 Zeilen, erhalten ${rows.length}`)
  if (!includesAll(flattened[0] ?? '', ['K-03', 'Robotik', 'Labor 2'])) errors.push('erste Quellzeile wurde nicht korrekt zugeordnet')
  if (!includesAll(flattened[1] ?? '', ['K-01', 'Datenschutz', 'Aula'])) errors.push('zweite Quellzeile wurde nicht korrekt zugeordnet')
  if (!includesAll(flattened[2] ?? '', ['K-99', 'Archivkunde', 'nicht gefunden'])) errors.push('fehlender Treffer wurde nicht markiert')
  if (!includesAll(flattened[3] ?? '', ['K-02', 'Podcast', 'Studio'])) errors.push('vierte Quellzeile wurde nicht korrekt zugeordnet')
  const finalTextNamesMatchCount = /\b3\b/.test(run.finalText) && /zugeordnet|treffer/i.test(run.finalText)
  const finalTextNamesMissingMatch = /nicht (?:zugeordnet|gefunden)/i.test(run.finalText)
  if (!finalTextNamesMatchCount || !finalTextNamesMissingMatch) {
    errors.push('Abschlussantwort nennt zugeordnete und nicht zugeordnete Zeilen nicht')
  }
  return errors
}

function validateAkkreditierung(run) {
  const args = writerArgs(run)
  const entries = Array.isArray(args.entries) ? args.entries : []
  const errors = []
  const byRow = new Map(entries.map(entry => [Number(entry?.row), entry]))
  const required = new Map([
    [4, 'Datenschutz mit lokalen Sprachmodellen'],
    [5, 'Lokale LLM Datenschutz'],
    [6, 'minimal: 8'],
    [7, '1 Halbtag'],
    [8, 'A'],
    [12, 'Fortbildung führt'],
    [13, 'Kurzvortrag'],
    [14, 'Teilnehmenden'],
    [15, 'Grundlagen lokaler Sprachmodelle'],
    [28, 'Informatik'],
    [29, 'Gesamtschule'],
    [30, 'Lehrkräfte'],
    [36, '12.11.2026'],
    [40, '05.11.2026'],
    [41, 'Medienzentrum Nord'],
    [42, 'Präsenz']
  ])
  if (args.template !== '300 - 📦 Ressourcen/320 - 🟦 Formulare/Akkreditierungsantrag 2021.docx') {
    errors.push('amtliche 2021er-Vorlage wurde nicht exakt verwendet')
  }
  for (const [row, fragment] of required) {
    const entry = byRow.get(row)
    if (!entry || !lower(entry.text).includes(lower(fragment))) {
      errors.push(`Formularzeile ${row} fehlt oder enthält nicht „${fragment}“`)
    }
  }
  if (entries.some(entry => Number(entry?.table) !== 2)) errors.push('mindestens ein Eintrag verwendet nicht Tabelle 2')
  if (entries.some(entry => Number(entry?.cell) !== (Number(entry?.row) === 0 ? 2 : 1))) {
    errors.push('mindestens ein Eintrag verwendet die falsche Zelle')
  }
  if (byRow.has(11) || byRow.has(23)) errors.push('fehlende Personendaten wurden erfunden')
  if (!/offen/i.test(run.finalText) || !/(?:verantwort|referent)/i.test(run.finalText)) {
    errors.push('Abschlussantwort benennt offene Personendaten nicht')
  }
  return errors
}

export const SKILL_CASES = [
  {
    id: 's01_elternbrief',
    skill: 'Elternbrief',
    expectedWriter: 'write_docx',
    requiredAttachments: ['ausflug-6b.txt'],
    instruction: 'Erstelle aus dem Anhang „ausflug-6b.txt“ einen Elternbrief als Word-Dokument. Baue eine abtrennbare Rückmeldung ein.',
    noteContent: '# Arbeitsnotiz\n\nElternkommunikation für Klasse 6b.',
    attachments: {
      'ausflug-6b.txt': `Ausflug der Klasse 6b
Termin: Donnerstag, 8. Oktober 2026
Ziel: Stadtmuseum Lindenbrück
Treffpunkt: 08:10 Uhr am Nordtor der Schule
Rückkehr: ungefähr 13:30 Uhr am Nordtor
Kosten: 7,50 Euro, passend in einem Umschlag
Mitbringen: Frühstück, Trinkflasche, wetterfeste Jacke
Rückmeldung und Geld bitte bis Montag, 28. September 2026 an die Klassenleitung.
Die Eltern sollen ankreuzen, ob ihr Kind teilnehmen darf, und unterschreiben.`
    },
    validate: validateElternbrief
  },
  {
    id: 's02_protokoll',
    skill: 'Protokoll',
    expectedWriter: 'write_note',
    requiredAttachments: ['teamsitzung.txt'],
    instruction: 'Erstelle aus „teamsitzung.txt“ ein sachliches Ergebnisprotokoll als Markdown-Notiz.',
    noteContent: '# Teamsitzung\n\nBitte die Mitschrift im Anhang verarbeiten.',
    attachments: {
      'teamsitzung.txt': `Teamsitzung Medienbildung
Datum: Dienstag, 15. September 2026
Zeit: 14:30–15:20 Uhr
Ort: Raum B 204
Teilnehmende: Lea Winter, Omar Voss, Pia Stern
Protokollführung: nicht notiert

TOP 1 Geräteausleihe
Diskussion: Rückgaben sind häufig nicht dokumentiert.
Beschluss: Ab 1. Oktober 2026 wird jede Ausgabe digital erfasst.
Aufgabe: Lea Winter erstellt bis 22. September 2026 eine Kurzanleitung.

TOP 2 Fortbildung
Diskussion: Zwei Termine wurden erwogen.
Beschluss: Die Fortbildung findet am 5. November 2026 statt.
Aufgabe: Omar Voss reserviert bis 18. September 2026 Raum B 204.

Offen: Wer verschickt die Einladung?`
    },
    validate: validateProtokoll
  },
  {
    id: 's03_zusammenfassung',
    skill: 'Zusammenfassung',
    expectedWriter: 'write_note',
    requiredNotes: ['Projekte/Pilotbericht.md'],
    instruction: 'Lies die Notiz „Projekte/Pilotbericht.md“ und erstelle eine kurze, weitergabefähige Zusammenfassung als neue Markdown-Notiz.',
    noteContent: '# Auftrag\n\nZusammenfassung des Pilotberichts.',
    notes: {
      'Projekte/Pilotbericht.md': `# Pilotbericht Lernatelier

Das Lernatelier wurde von Januar bis Juni 2026 in drei Lerngruppen erprobt. Insgesamt nahmen 64 Jugendliche teil. Die Koordination lag bei Nora Feld. Das Kollegium bewertete die verbindliche Wochenplanung als hilfreich, äußerte aber unterschiedliche Einschätzungen zur freien Themenwahl.

In 18,75 Prozent der protokollierten Arbeitsphasen baten Jugendliche um zusätzliche Strukturhilfen. Dieser Wert wurde nicht statistisch auf andere Jahrgänge übertragen. Zwei Lerngruppen nutzten digitale Wochenpläne, eine Gruppe arbeitete auf Papier.

Die Projektgruppe empfiehlt, die Erprobung bis zum 4. November 2026 fortzuführen. Vor einer dauerhaften Einführung sollen Kriterien für die Rückmeldung der Jugendlichen beschlossen werden. Offen ist, ob im nächsten Halbjahr ausreichend Begleitstunden zur Verfügung stehen.

Die Schulleitung hat den Bericht zur Kenntnis genommen. Eine abschließende Entscheidung wurde ausdrücklich noch nicht getroffen.`
    },
    validate: validateZusammenfassung
  },
  {
    id: 's04_literaturnotiz',
    skill: 'Literaturnotiz',
    expectedWriter: 'write_note',
    requiredAttachments: ['paper-auszug.txt'],
    instruction: 'Verarbeite „paper-auszug.txt“ zu einer strukturierten Literaturnotiz im Zettelkasten-Stil.',
    noteContent: '# Literaturarbeit\n\nDie extrahierte Quelle liegt im Anhang.',
    attachments: {
      'paper-auszug.txt': `Mara König (2024): Lokale Sprachmodelle in Schulen: Eine explorative Feldstudie. Zeitschrift für Digitale Bildung, 12(2), S. 31–49.

Abstract: Untersucht wird, wie lokale Sprachmodelle in schulischen Verwaltungsprozessen eingesetzt werden, ohne Rohdaten an externe Dienste zu übertragen.

Methode (S. 34–35): Befragt wurden n = 128 Lehrkräfte aus sieben Schulen. Ergänzend wurden 22 leitfadengestützte Interviews ausgewertet. Die Stichprobe war eine Gelegenheitsstichprobe.

Befunde (S. 37): 14,6 Prozent der Befragten kannten den Unterschied zwischen lokaler Inferenz und einem Cloud-Dienst bereits vor der Fortbildung. Nach einer zweistündigen Einführung konnten 93 von 128 Personen beide Betriebsarten korrekt zuordnen.

Befunde (S. 41): Als größte Hürden nannten die Befragten unklare Modellgrenzen und fehlende Zeit zur Qualitätskontrolle. Die Studie behauptet keine Repräsentativität.

Diskussion (S. 45–46): Lokaler Betrieb reduziert die Übertragung an externe Anbieter, ersetzt aber weder Zugriffsschutz noch eine Prüfung der Ergebnisse. Offen bleibt, wie sich die Befunde auf andere Schulformen übertragen lassen.`
    },
    validate: validateLiteraturnotiz
  },
  {
    id: 's05_webseiten_artikel',
    skill: 'Webseiten-Artikel',
    expectedWriter: 'write_note',
    requiredAttachments: ['projekttag.txt'],
    instruction: 'Schreibe aus „projekttag.txt“ einen veröffentlichungsreifen Webseiten-Entwurf als Markdown-Notiz. Verwende ausschließlich belegte Angaben.',
    noteContent: '# Öffentlichkeitsarbeit\n\nEntwurf für die Schulwebseite.',
    attachments: {
      'projekttag.txt': `Projekttag „Wasser vor Ort“
Datum: Dienstag, 17. November 2026
Ort: Gesamtschule Am Park und Bachlauf am Mühlenweg
Beteiligt: zwei achte Klassen, Fachbereich Biologie, Umweltlabor der Stadt
Ablauf: Morgens erklärte das Umweltlabor in der Aula die sichere Probenahme und den Umgang mit den Messkoffern. Danach gingen die Jugendlichen in sechs Gruppen zum Bachlauf am Mühlenweg. Jede Gruppe dokumentierte Uhrzeit, Entnahmestelle, Wassertemperatur und sichtbare Besonderheiten. Am Nachmittag wurden die Proben im Biologieraum ausgewertet.
Arbeitsstationen: An einer Station bestimmten die Gruppen den pH-Wert. Eine zweite Station behandelte Nitrat. An der dritten Station verglichen sie die Wassertemperatur der Entnahmestellen. Die Messwerte wurden auf vorbereiteten Bögen erfasst und anschließend gemeinsam kontrolliert.
Ergebnisse: In vier Proben wurden Nitratwerte unter 20 mg/l gemessen. Zwei Proben konnten wegen beschädigter Teststreifen nicht ausgewertet werden. Die pH-Werte lagen zwischen 7,1 und 7,6. Die Gruppen stellten fest, dass eine einzelne Messung keine allgemeine Aussage über die Gewässerqualität erlaubt.
Eine Schülerin heißt Mila Hartmann. Für die Nennung ihres Namens liegt keine Einwilligung vor.
Es wurden keine wörtlichen Zitate protokolliert.
Zusammenarbeit: Der Fachbereich Biologie plante die Stationen. Das Umweltlabor der Stadt stellte sechs Messkoffer bereit und unterstützte die Einführung. Zwei Lehrkräfte begleiteten den Weg zum Bach. Namen der Lehrkräfte wurden nicht notiert.
Dank: Das Umweltlabor der Stadt stellte die Messkoffer bereit. Außerdem half der Hausmeister bei der Vorbereitung der Aula.
Ausblick: Ergebnisse werden am Donnerstag, 26. November 2026 im Biologieunterricht verglichen.
Verantwortliche Person für die redaktionelle Freigabe ist noch nicht festgelegt.`
    },
    validate: validateWebseitenArtikel
  },
  {
    id: 's06_wissenschaftliche_webseite',
    skill: 'Wissenschaftliche Webseite',
    expectedWriter: 'write_html',
    requiredAttachments: ['messreihe.txt'],
    instruction: 'Erstelle aus „messreihe.txt“ genau eine wissenschaftliche HTML-Seite mit einer Formel und einer einfachen SVG-Grafik.',
    noteContent: '# Messreihe\n\nDie fachliche Quelle liegt im Anhang.',
    attachments: {
      'messreihe.txt': `Titel: Abkühlung einer Wasserprobe
Kontext: Physik-AG, synthetische Messreihe
Messwerte: t = 0 min: 80 °C; 5 min: 62 °C; 10 min: 50 °C; 15 min: 42 °C; Umgebung: 22 °C.
Modell: Newtonsches Abkühlungsgesetz dT/dt = -k(T - T_U).
Für diese Messreihe wird k = 0,081 min^-1 als Näherung verwendet.
Quelle: I. Newton: Scala graduum Caloris. Philosophical Transactions, 1701.
Die Grafik soll Zeit auf der x-Achse und Temperatur auf der y-Achse zeigen.`
    },
    validate: validateWissenschaftlicheWebseite
  },
  {
    id: 's07_teilnehmerliste',
    skill: 'Teilnehmerliste',
    expectedWriter: 'write_xlsx',
    requiredAttachments: ['anmeldungen.csv'],
    instruction: 'Erstelle aus „anmeldungen.csv“ eine Anwesenheitsliste als Excel-Datei. Benötigt werden nur Name, Vorname und Schule.',
    noteContent: '# Fortbildung\n\nAnwesenheitsliste erstellen.',
    attachments: {
      'anmeldungen.csv': `Vorname;Nachname;Schule;E-Mail
Mina;Zorn;Eichenschule;mina.zorn@example.invalid
Ada;Kern;Parkschule;ada.kern@example.invalid
Ben;Adler;Waldschule;ben.adler@example.invalid
Ada;Kern;Parkschule;ada.kern@example.invalid`
    },
    validate: validateTeilnehmerliste
  },
  {
    id: 's08_tabellen_zuordnung',
    skill: 'Tabellen-Zuordnung',
    expectedWriter: 'write_xlsx',
    requiredAttachments: ['kurse.csv', 'raeume.csv'],
    instruction: 'Führe „kurse.csv“ und „raeume.csv“ über die Kurs-ID zusammen. Gib Kurs-ID, Kurs und Raum als Excel-Datei aus und behalte die Reihenfolge aus kurse.csv bei.',
    noteContent: '# Kursplanung\n\nZwei Tabellen müssen zugeordnet werden.',
    attachments: {
      'kurse.csv': `Kurs-ID;Kurs
K-03;Robotik
K-01;Datenschutz
K-99;Archivkunde
K-02;Podcast`,
      'raeume.csv': `Kurs-ID;Raum
 k-01 ;Aula
K-02;Studio
K-03;Labor 2`
    },
    validate: validateTabellenZuordnung
  },
  {
    id: 's09_akkreditierung',
    skill: 'Akkreditierung',
    expectedWriter: 'fill_docx_form',
    requiredAttachments: ['fortbildungskonzept.txt'],
    requiredSkillFiles: ['references/felder.md'],
    instruction: 'Fülle aus „fortbildungskonzept.txt“ den Akkreditierungsantrag als fertiges Word-Formular aus. Nicht genannte Angaben bleiben leer.',
    noteContent: '# Akkreditierung\n\nDas Konzept liegt im Anhang.',
    attachments: {
      'fortbildungskonzept.txt': `Titel: Datenschutz mit lokalen Sprachmodellen
Kurztitel: Lokale LLM Datenschutz
Kategorie: A
Teilnehmerzahl: minimal 8, optimal 14, maximal 18
Dauer: 1 Halbtag (3 Zeitstunden)
Termin: 12.11.2026, 14:00 bis 17:00 Uhr
Anmeldeschluss: 05.11.2026
Ort: Medienzentrum Nord, Hafenstraße 12, 35100 Lindenbrück, Seminarraum 3
Format: Präsenz
Veröffentlichungstext: Die Fortbildung führt in den datensparsamen Einsatz lokal betriebener Sprachmodelle im schulischen Arbeitsalltag ein. Anhand praxisnaher Übungen prüfen die Teilnehmenden, welche Daten verarbeitet werden dürfen und wie Ergebnisse fachlich kontrolliert werden.
Methodische Gestaltung: Kurzvortrag, Demonstration, Einzelarbeit und kollegiale Auswertung
Fähigkeiten und Fertigkeiten: Die Teilnehmenden unterscheiden lokale und cloudbasierte Verarbeitung, formulieren datensparsame Arbeitsaufträge und prüfen Modellergebnisse anhand transparenter Kriterien.
Teilnahmebescheinigung: Grundlagen lokaler Sprachmodelle\nDatensparsame Promptgestaltung\nQualitätsprüfung
Fächer: Informatik, Politik und Wirtschaft
Schulformen: Gesamtschule, Gymnasium
Zielgruppen: Lehrkräfte, schulische Datenschutzbeauftragte
Verantwortliche Person: nicht angegeben
Referenten: nicht angegeben`
    },
    validate: validateAkkreditierung
  }
]
