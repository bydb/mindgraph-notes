#!/usr/bin/env node
// Prüft am echten LLMBase-Endpunkt, ob ein Modell für den Agenten taugt und wie es mit
// großen Prompts umgeht. Grundlage dafür, dass contextBudget.ts LLMBase den Katalogwert
// glaubt (CATALOG_BACKENDS): ein zu großer Prompt muss LAUT scheitern, nie still gekürzt.
//
//   A) Werkzeugaufruf: passendes Werkzeug, kein passendes Werkzeug, Ergebnis-Rundlauf
//   B) Langer Kontext mit drei Prüfcodes (Anfang/Mitte/Ende) bei ~150k und ~700k Token
//   C) Überlauf bei ~1,25 Mio. Token: Fehler (gewünscht) oder Antwort mit gekürztem Text?
//
// Ergebnis 15.11.2026 (deepseek/deepseek-v4.1-flash, Katalog 1 048 576): A alles korrekt,
// B und zusätzlich 952k vollständig, C jedes Mal HTTP 503 `model_temporarily_unavailable`.
//
// Legt über den Management-Key einen Wegwerf-Schlüssel an (3 $ Limit, nur dieses Modell)
// und widerruft ihn am Ende. Kein Secret wird ausgegeben. Kosten je Lauf etwa 1 $.
// Management-Key: macOS-Schlüsselbund-Eintrag `llmbase-management-key` oder
// Umgebungsvariable LLMBASE_MANAGEMENT_KEY.
//
// Aufruf:  node scripts/check-llmbase-context.mjs   (anderes Modell: PROBE_MODEL=… )
import { execFileSync } from 'node:child_process'

const BASE = 'https://api.llmbase.ai/v1'
const MODEL = process.env.PROBE_MODEL || 'deepseek/deepseek-v4.1-flash'
const MK = process.env.LLMBASE_MANAGEMENT_KEY?.trim() || (() => {
  try { return execFileSync('security', ['find-generic-password', '-s', 'llmbase-management-key', '-w'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() } catch { return '' }
})()
if (!MK) { console.error('Kein Management-Key (Schlüsselbund llmbase-management-key oder LLMBASE_MANAGEMENT_KEY).'); process.exit(1) }

async function mgmt(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${MK}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000)
  })
  const json = await res.json().catch(() => ({}))
  return { ok: res.ok, status: res.status, json }
}

let key = null
async function chat(body, timeoutMs = 600000) {
  const t0 = Date.now()
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, ...body }),
    signal: AbortSignal.timeout(timeoutMs)
  })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch {}
  const headers = {}
  for (const [k, v] of res.headers) if (!/cookie|authorization/i.test(k)) headers[k] = v
  return { status: res.status, json, text: json ? null : text.slice(0, 500), headers, ms: Date.now() - t0 }
}

// Füllzeilen: abwechslungsreich, damit nichts trivial komprimierbar ist.
const WOERTER = ['Lager', 'Artikel', 'Bestand', 'Lieferant', 'Auftrag', 'Rechnung', 'Kunde', 'Charge', 'Menge', 'Preis', 'Termin', 'Konto', 'Beleg', 'Werk', 'Halle', 'Regal']
let seed = 42
const rnd = n => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n }
function zeile(i) {
  return `Zeile ${i}: ${WOERTER[rnd(16)]} ${rnd(90000) + 10000} im ${WOERTER[rnd(16)]} ${rnd(900) + 100} hat ${WOERTER[rnd(16)]} ${rnd(9999)} Stück, Stand ${rnd(28) + 1}.${rnd(12) + 1}.2026.`
}
function heuhaufen(zeilen, codes) {
  const out = []
  const mitte = Math.floor(zeilen / 2)
  for (let i = 0; i < zeilen; i++) {
    if (i === 5) out.push(`WICHTIG: Der erste Prüfcode lautet ${codes[0]}.`)
    if (i === mitte) out.push(`WICHTIG: Der zweite Prüfcode lautet ${codes[1]}.`)
    out.push(zeile(i))
  }
  out.push(`WICHTIG: Der dritte Prüfcode lautet ${codes[2]}.`)
  return out.join('\n')
}

const log = (...a) => console.log(...a)
const usage = r => r.json?.usage ? `prompt_tokens=${r.json.usage.prompt_tokens}, completion_tokens=${r.json.usage.completion_tokens}` : 'keine usage'

async function needle(label, zeilen) {
  const codes = [`ANF-${rnd(9000) + 1000}`, `MIT-${rnd(9000) + 1000}`, `END-${rnd(9000) + 1000}`]
  const doc = heuhaufen(zeilen, codes)
  log(`\n── ${label}: ${zeilen} Zeilen, ${(doc.length / 1e6).toFixed(2)} Mio. Zeichen`)
  const r = await chat({
    messages: [
      { role: 'system', content: 'Du bist ein genauer Prüfer.' },
      { role: 'user', content: `${doc}\n\nNenne alle drei Prüfcodes aus dem Text oben, genau in der Form ERSTER=…, ZWEITER=…, DRITTER=…. Wenn du einen nicht findest, schreibe FEHLT.` }
    ],
    max_tokens: 4000
  })
  log(`   HTTP ${r.status} in ${(r.ms / 1000).toFixed(1)} s, ${usage(r)}`)
  if (r.status !== 200) { log('   Fehler:', JSON.stringify(r.json?.error ?? r.text).slice(0, 400)); return { r, codes } }
  const ans = r.json.choices?.[0]?.message?.content ?? ''
  log(`   Antwort: ${ans.replace(/\s+/g, ' ').slice(0, 200)}`)
  log(`   gefunden: Anfang=${ans.includes(codes[0])} Mitte=${ans.includes(codes[1])} Ende=${ans.includes(codes[2])}  (soll ${codes.join(', ')})`)
  log(`   finish_reason=${r.json.choices?.[0]?.finish_reason}, model=${r.json.model}, provider=${r.json.provider ?? '-'}`)
  return { r, codes }
}

async function main() {
  const created = await mgmt('POST', '/keys', {
    name: `Kontextprobe ${MODEL}`.slice(0, 100),
    end_customer_ref: `probe:ctx:${Date.now()}`,
    daily_limit_usd_cents: 300,
    monthly_limit_usd_cents: 300,
    allowed_models: [MODEL]
  })
  if (!created.ok) { log('Schlüssel anlegen fehlgeschlagen:', created.status, JSON.stringify(created.json)); process.exit(1) }
  key = created.json.secret
  const keyId = created.json.id
  log(`Wegwerf-Schlüssel angelegt (Limit 3 $, nur ${MODEL}).`)
  try {
    // A) Werkzeuge
    const tools = [{ type: 'function', function: { name: 'lagerbestand', description: 'Liefert den aktuellen Lagerbestand eines Artikels aus dem ERP.', parameters: { type: 'object', properties: { artikelnummer: { type: 'string' } }, required: ['artikelnummer'] } } }]
    log('\n── A1 Werkzeug passt (Bestand Artikel 4711)')
    let r = await chat({ messages: [{ role: 'user', content: 'Wie hoch ist der Lagerbestand von Artikel 4711?' }], tools, max_tokens: 2000 }, 120000)
    log(`   HTTP ${r.status}, ${usage(r)}`)
    log('   tool_calls:', JSON.stringify(r.json?.choices?.[0]?.message?.tool_calls ?? null), ' finish:', r.json?.choices?.[0]?.finish_reason)
    log('   Antwort-Header (Auswahl):', JSON.stringify(Object.fromEntries(Object.entries(r.headers).filter(([k]) => /region|provider|location|server|x-|via|cf-ray/i.test(k)))))

    log('\n── A2 kein passendes Werkzeug (Hauptstadt Frankreich)')
    r = await chat({ messages: [{ role: 'user', content: 'Wie heißt die Hauptstadt von Frankreich? Antworte mit einem Wort.' }], tools, max_tokens: 2000 }, 120000)
    log(`   HTTP ${r.status}, tool_calls: ${JSON.stringify(r.json?.choices?.[0]?.message?.tool_calls ?? null)}, Antwort: ${(r.json?.choices?.[0]?.message?.content ?? '').slice(0, 80)}`)

    log('\n── A3 Werkzeugergebnis zurückgeben (Rundlauf)')
    r = await chat({
      messages: [
        { role: 'user', content: 'Wie hoch ist der Lagerbestand von Artikel 4711?' },
        { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lagerbestand', arguments: '{"artikelnummer":"4711"}' } }] },
        { role: 'tool', tool_call_id: 'call_1', content: '{"artikelnummer":"4711","bestand":137,"einheit":"Stück","lager":"Halle 3"}' }
      ], tools, max_tokens: 2000
    }, 120000)
    log(`   HTTP ${r.status}, Antwort: ${(r.json?.choices?.[0]?.message?.content ?? JSON.stringify(r.json?.error)).replace(/\s+/g, ' ').slice(0, 160)}`)

    // Kalibrieren: Token je Zeile
    const kal = await needle('Kalibrierung', 2000)
    const tpl = (kal.r.json?.usage?.prompt_tokens ?? 2000 * 30) / 2000
    log(`   ≈ ${tpl.toFixed(1)} Token je Zeile`)

    // B) groß, aber im Fenster
    await needle('B1 ~150k Token', Math.round(150000 / tpl))
    await needle('B2 ~700k Token', Math.round(700000 / tpl))
    // C) über dem Fenster
    await needle('C  ~1,25 Mio. Token (über dem Fenster)', Math.round(1250000 / tpl))
  } finally {
    const del = await mgmt('DELETE', `/keys/${keyId}`)
    log(`\nWegwerf-Schlüssel widerrufen: ${del.ok ? 'ja' : `NEIN (HTTP ${del.status}) – bitte im Dashboard prüfen`}`)
  }
}
main().catch(e => { console.error('Abbruch:', e.message); process.exit(1) })
