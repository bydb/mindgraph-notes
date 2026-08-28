#!/usr/bin/env node
// Prüft empirisch, wie OpenRouter mit `provider: { zdr: true }` umgeht.
//
// Die Frage: Was passiert, wenn für ein Modell KEIN Endpunkt mit Zero Data
// Retention verfügbar ist? Lehnt OpenRouter ab (fail-closed, gewünscht) oder
// routet es still zu einem Anbieter ohne die Zusage (dann ist das Flag
// Dekoration und täuscht Schutz vor)?
//
// Die Doku sagt es nicht. Für den verwandten `only`-Filter steht dort
// "the request fails with a 404" — belegt ist das für `zdr` damit nicht.
//
// Aufruf:  OPENROUTER_API_KEY=sk-or-... node scripts/check-openrouter-zdr.mjs
// Der Schlüssel wird nur an openrouter.ai gesendet, nirgends gespeichert.

const key = process.env.OPENROUTER_API_KEY?.trim()
if (!key) {
  console.error('Fehler: OPENROUTER_API_KEY nicht gesetzt.')
  console.error('Aufruf: OPENROUTER_API_KEY=sk-or-... node scripts/check-openrouter-zdr.mjs')
  process.exit(1)
}

// Kleine, billige Modelle mit breit gestreuten Hostern — je nach ZDR-Verfügbarkeit
// sollte mindestens eines davon ohne passenden Endpunkt dastehen.
const MODELLE = [
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'z-ai/glm-5.3-flash',
  'qwen/qwen3.8-flash'
]

async function frage(model, zdr) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content: 'Antworte mit dem Wort OK.' }],
      max_tokens: 5,
      ...(zdr ? { provider: { zdr: true } } : {})
    }),
    signal: AbortSignal.timeout(30_000)
  })
  const text = await res.text()
  let anbieter = '?'
  let fehler = ''
  try {
    const j = JSON.parse(text)
    anbieter = j.provider ?? j.provider_name ?? '?'
    fehler = j.error?.message ?? ''
  } catch { fehler = text.slice(0, 120) }
  return { status: res.status, anbieter, fehler }
}

console.log('Modell'.padEnd(26) + 'ohne ZDR'.padEnd(26) + 'mit zdr:true')
console.log('-'.repeat(78))
let abgelehnt = 0
let durchgelassen = 0
for (const model of MODELLE) {
  const ohne = await frage(model, false)
  const mit = await frage(model, true)
  const links = `${ohne.status} ${ohne.anbieter}`.slice(0, 24)
  const rechts = mit.status === 200
    ? `200 ${mit.anbieter}`
    : `${mit.status} ${mit.fehler}`.slice(0, 46)
  console.log(model.padEnd(26) + links.padEnd(26) + rechts)
  if (ohne.status === 200 && mit.status !== 200) abgelehnt++
  if (ohne.status === 200 && mit.status === 200) durchgelassen++
}

console.log()
console.log(`Abgelehnt trotz erfolgreichem Gegenversuch: ${abgelehnt}`)
console.log(`Mit ZDR durchgelassen: ${durchgelassen}`)
console.log()
if (abgelehnt > 0) {
  console.log('BEFUND: OpenRouter lehnt ab, wenn kein ZDR-Endpunkt passt — fail-closed.')
  console.log('Die Zusage im Notiz-Agenten trägt.')
} else {
  console.log('BEFUND UNKLAR: Alle geprüften Modelle haben ZDR-Endpunkte, der Fehlerfall')
  console.log('wurde nicht ausgelöst. Das ist KEIN Beleg für fail-closed — für einen')
  console.log('Beweis braucht es ein Modell ohne ZDR-Endpunkt.')
}
console.log()
console.log('Kosten dieses Tests: ein paar Zehntel Cent (4 bis 8 Aufrufe à 5 Token).')
