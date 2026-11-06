import { describe, it, expect, vi } from 'vitest'
import { AntaresService, findDashboardButton, isUnfilteredResult, parseAutosearch } from './service'

const entleiher = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ identifier: String(i), fn_ename: `N${i}`, fn_vorname: 'V', fn_enr: String(1000 + i) }))

// Format wie im echten Antares-Dashboard (Antares CS 2.0.4): Suchparameter HTML-escaped im data-onclick.
const activeButton = (type: string, count: number) => `
	<a class="easyui-linkbutton fullsize topmargin" data-onclick="searchmask.autosearch(
			&quot;type&quot;:&quot;${type}&quot;,
			&quot;search&quot;: {
				&quot;regfilter&quot;	: &quot;1&quot;
			}
		)" data-options="plain:false">
		<span class="ared">
							${count}
							offene Registrierungen
		</span>
	</a>`
const disabledButton = `
	<a class="easyui-linkbutton fullsize topmargin" data-onclick="" data-options="plain:false,disabled:true">
		<span class="">
							0
							offene Registrierungen
		</span>
	</a>`

/** Fake-Antares: Login klappt immer; /search liefert die vorgegebene Antwort; Prime-Bodies werden protokolliert. */
function fakeServer(dashboard: string, searchResponse: { rows: unknown[]; total: number }) {
  const primeBodies: string[] = []
  let searchCalls = 0
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    if (url.endsWith('/')) return new Response('<a href="login?pid=abc123">', { status: 200 })
    if (url.includes('/login')) return new Response('', { status: 302 })
    if (url.includes('/dashboard')) return new Response(`<div>${dashboard}</div>`, { status: 200 })
    if (url.includes('/result')) { primeBodies.push(String(init?.body)); return new Response('', { status: 200 }) }
    if (url.includes('/search')) { searchCalls++; return json(searchResponse) }
    throw new Error('unexpected ' + url)
  })
  return { fetchImpl, primeBodies, searchCalls: () => searchCalls }
}

const make = (f: ReturnType<typeof fakeServer>) =>
  new AntaresService('https://mz.example', 'u', 'p', 'HE/16', f.fetchImpl as never)

describe('Dashboard-Button parsen', () => {
  it('liest Suchparameter aus searchmask.autosearch', () => {
    const b = findDashboardButton(activeButton('entleiher', 2), /offene\s+Registrierung/i)
    expect(b?.text).toBe('2 offene Registrierungen')
    expect(parseAutosearch(b!.onclick)).toEqual({ type: 'entleiher', search: { regfilter: '1' } })
  })

  it('deaktivierter Button hat keine Aktion', () => {
    expect(findDashboardButton(disabledButton, /offene\s+Registrierung/i)?.onclick).toBe('')
  })

  it('andere Aktionen sind kein autosearch', () => {
    expect(parseAutosearch('record.open("type":"verleihfuncs", "id": "5_geraete")')).toBeNull()
  })
})

describe('isUnfilteredResult', () => {
  it('erkennt den Gesamtbestand', () => {
    expect(isUnfilteredResult(12703, 12703, 50)).toBe(true)
    expect(isUnfilteredResult(50, 12703, 50)).toBe(true)
    expect(isUnfilteredResult(2, 2, 50)).toBe(false)
  })
})

describe('listOffeneRegistrierungen', () => {
  it('fragt bei deaktiviertem Button gar nicht erst nach', async () => {
    const f = fakeServer(disabledButton, { rows: entleiher(12705), total: 12705 })
    expect(await make(f).listOffeneRegistrierungen()).toEqual([])
    expect(f.searchCalls()).toBe(0)
  })

  it('sucht mit den Parametern des Dashboard-Buttons', async () => {
    const f = fakeServer(activeButton('entleiher', 2), { rows: entleiher(2), total: 2 })
    expect(await make(f).listOffeneRegistrierungen()).toHaveLength(2)
    expect(f.primeBodies).toHaveLength(1)
    const body = new URLSearchParams(f.primeBodies[0])
    expect(body.get('autosearch')).toBe('true')
    expect(body.get('regfilter')).toBe('1')
  })

  it('wirft statt den Gesamtbestand als Registrierungen anzuzeigen', async () => {
    const f = fakeServer(activeButton('entleiher', 2), { rows: entleiher(12705), total: 12705 })
    await expect(make(f).listOffeneRegistrierungen()).rejects.toThrow(/Filter/)
  })

  it('wirft bei unbekannter Button-Aktion', async () => {
    const f = fakeServer(activeButton('kunden', 2), { rows: [], total: 0 })
    await expect(make(f).listOffeneRegistrierungen()).rejects.toThrow(/unbekannte Aktion/)
  })
})
