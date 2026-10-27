#!/usr/bin/env python3
"""Edupool-Hessen-Recherche über die Gast-Sitzung des Portals (nur lesen).

Die Schnittstelle ist undokumentiert. Liefert sie nicht mehr, was erwartet wird,
bricht das Skript mit einer klaren Meldung ab, statt Treffer zu erfinden.

  suche  --standort N --begriffe A B ... [--max 100] --out treffer.json  (sammelt bei Wiederholung)
  zeige  treffer.json --zielgruppe gs|wf --stichwort fotosynth ... [--ab 1] [--offene]
  notiz  treffer.json --zielgruppe gs|wf --thema T --kern 1,2 [--rand 3,4] --out liste.md
"""
import argparse, html, http.cookiejar, json, re, sys, time, urllib.parse, urllib.request
from concurrent.futures import ThreadPoolExecutor

BASE = 'https://hessen.edupool.de'
PAGE = 24
ZG_NAME = {'gs': 'Grund- und Förderschule', 'wf': 'Weiterführende Schulen'}


class PortalFehler(Exception):
    pass


class Sitzung:
    def __init__(self, standort):
        self.standort = standort
        self.jar = http.cookiejar.CookieJar()
        self.op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar))
        self.op.addheaders = [('User-Agent', 'MindGraph-Notes Edupool-Recherche')]
        self.pid = None

    def get(self, pfad, daten=None):
        body = urllib.parse.urlencode(daten).encode() if daten else None
        with self.op.open(BASE + pfad, body, timeout=20) as r:
            return r.geturl(), r.read().decode('utf-8', 'replace')

    def neu(self):
        url, _ = self.get(f'/home?standort={self.standort}')
        m = re.search(r'[?&]pid=([A-Za-z0-9]+)', url)
        if not m:
            raise PortalFehler('Keine Gast-Sitzung (pid) erhalten - Gastzugang aus oder Portal geändert.')
        self.pid = m.group(1)

    def suche(self, begriff):
        for _ in range(3):
            if not self.pid:
                self.neu()
            _, txt = self.get(f'/execsearch?pid={self.pid}', {
                'text': begriff, 'sfields': 'text_fields', 'word': 'BEGIN',
                'andor': 'AND', 'gebsearch': '1', 'ailimit': '60'})
            try:
                j = json.loads(txt)
            except ValueError:
                raise PortalFehler('Suche liefert kein JSON mehr - Schnittstelle geändert.')
            if j.get('status') == 'reload':
                self.pid = None
                continue
            return int(j.get('count') or 0)
        raise PortalFehler('Sitzung läuft dauernd ab (status reload).')

    def seite(self, start):
        _, txt = self.get(f'/resultpart?template=superplain&start={start}&type=list&pid={self.pid}')
        return txt


def text(s):
    return re.sub(r'\s+', ' ', html.unescape(re.sub(r'<[^>]+>', ' ', s or ''))).strip()


def liste_lesen(txt):
    out = []
    for block in txt.split('data-mediaid=')[1:]:
        mid = re.match(r'"([^"]+)"', block)
        if not mid:
            continue
        info = re.search(r'class="media_info[^"]*">(.*?)</div>\s*<div class="media_title', block, re.S)
        felder = [text(x) for x in re.findall(r'<div>(.*?)</div>', info.group(1), re.S)] if info else []
        dauer = next((f for f in felder if re.fullmatch(r'\d{1,3}:\d{2}(:\d{2})?', f)), '')
        jahr = next((f for f in felder if re.fullmatch(r'(19|20)\d{2}', f)), '')
        art = next((f for f in felder if f not in (dauer, jahr)), '')
        t = re.search(r'<h4[^>]*func-dynamic-title[^>]*>(.*?)</h4>', block, re.S)
        b = re.search(r'<div class="media_text[^"]*">(.*?)</div>', block, re.S)
        c = re.search(r'<div class="media-image">\s*<img src=.([^\'"]+)', block)
        out.append({'id': mid.group(1), 'titel': text(t.group(1)) if t else '', 'art': art,
                    'laufzeit': dauer, 'jahr': jahr, 'text': text(b.group(1)) if b else '',
                    'cover': c.group(1) if c else ''})
    return out


def feld(t, name):
    m = re.search(r'<i>' + name + r':</i>(.*?)</p>', t, re.S)
    return text(m.group(1)) if m else ''


def details(s, rec):
    try:
        _, t = s.get(f'/tabrecord?template=tabs&id={urllib.parse.quote(rec["id"])}&src=online&pid={s.pid}')
    except Exception as e:  # einzelner Datensatz - Lauf geht weiter, Lücke wird benannt
        rec['fehler'] = str(e)[:80]
        return rec
    t = html.unescape(t)
    rec['adressaten'] = feld(t, 'Adressaten')
    rec['faecher'] = feld(t, 'Sachgebiete/Fächer')[:160]
    rec['signatur'] = feld(t, 'Signatur').split(' ')[0]
    m = re.search(r'FWU-0?(55\d{5})/', t)
    rec['produktion'] = m.group(1) if m else ''
    return rec


def cmd_suche(a):
    s = Sitzung(a.standort)
    alle, gesamt = {}, {}
    try:  # weitere Aufrufe sammeln in dieselbe Datei (Zeitlimit je Shell-Befehl)
        alt = json.load(open(a.out, encoding='utf-8'))
        if alt.get('standort') == a.standort:
            alle = {r['id']: r for r in alt['medien']}
            gesamt = alt['begriffe']
    except (OSError, ValueError, KeyError):
        pass
    vorher = set(alle)
    for begriff in a.begriffe:
        n = s.suche(begriff)
        gesamt[begriff] = n
        geholt = 0
        while geholt < min(n, a.max):
            recs = liste_lesen(s.seite(geholt))
            if not recs:
                break
            geholt += len(recs)
            for r in recs:
                if r['id'] in alle:
                    continue
                r['begriff'] = begriff
                alle[r['id']] = r
        print(f'{begriff}: {n} Treffer im Portal, gelesen {geholt}', file=sys.stderr)
    if not alle and any(gesamt.values()):
        raise PortalFehler('Portal meldet Treffer, die Trefferliste ist aber leer - Seitenformat geändert.')
    with ThreadPoolExecutor(4) as ex:
        list(ex.map(lambda r: details(s, r), [r for k, r in alle.items() if k not in vorher]))
    recs = list(alle.values())
    ohne = sum(1 for r in recs if not r.get('adressaten') and not r['id'].startswith('sodix-'))
    json.dump({'standort': a.standort, 'begriffe': gesamt, 'abgerufen': time.strftime('%Y-%m-%d %H:%M'),
               'medien': recs}, open(a.out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'OK: {len(recs)} Medien in {a.out} (ohne Adressaten-Feld: {ohne}). Trefferzahlen: {json.dumps(gesamt, ensure_ascii=False)}')


def zielgruppen(adr):
    """Menge aus {'gs','wf'} nach dem Adressaten-Feld; leer = nicht bestimmbar."""
    z = set()
    for vor, lo, hi in re.findall(r'(?:Klasse|Jahrgang(?:sstufe)?)\s*(ab\s*|bis\s*)?(\d{1,2})(?:\s*-\s*(\d{1,2}))?', adr):
        if vor.startswith('bis'):
            lo, hi = 1, int(lo)
        else:
            lo = int(lo); hi = 13 if vor else int(hi or lo)
        if lo <= 4:
            z.add('gs')
        if hi >= 5:
            z.add('wf')
    if re.search(r'Sonderpäd|Förderschul|Elementar|Vorschul|Kindergarten|Primar', adr):
        z.add('gs')
    if re.search(r'Berufsbild|Erwachsenen|Sekundar|Hochschul|Oberstufe', adr):
        z.add('wf')
    return z


def nummer(r):
    sig = r.get('signatur', '')
    if sig.startswith('55'):
        return sig
    return r.get('produktion', '')


def gruppen(daten, zg):
    """Lizenzierte Medien der Zielgruppe, FWU-Module je Produktion zusammengefasst."""
    lic, oer, andere, offen = {}, [], 0, []
    for r in daten['medien']:
        if r['id'].startswith('sodix-'):
            oer.append(r)
            continue
        z = zielgruppen(r.get('adressaten', ''))
        if not z:
            offen.append(r)
            continue
        if zg not in z:
            andere += 1
            continue
        key = ('P' + r['produktion']) if r['id'].startswith('xfwumodule-') and r.get('produktion') else r['id']
        lic.setdefault(key, []).append(r)
    reihen = sorted(lic.values(), key=lambda g: (-max(int(x.get('jahr') or 0) for x in g), g[0]['titel']))
    return reihen + [[r] for r in offen], oer, andere, len(offen)


def link(r, standort):
    return f'{BASE}/home?standort={standort}&record={urllib.parse.quote(r["id"])}&src=online'


def passt(r, worte):
    blob = ' '.join((r.get('titel', ''), r.get('text', ''), r.get('faecher', ''))).lower()
    return any(w in blob for w in worte)


def zeile_kurz(i, g, worte):
    r = g[0]
    reihe = ''
    if len(g) > 1:
        teile = [x['titel'].split(': ')[-1] for x in g[1:] if worte and passt(x, worte)]
        reihe = f' [Reihe: {len(g)} Teile' + (f'; passend: {"; ".join(teile)[:90]}' if teile else '') + ']'
    return (f'{i}. {r["titel"][:70]}{reihe} | {r.get("art","")} {r.get("laufzeit","")} {r.get("jahr","")} | '
            f'Nr {nummer(r) or "-"} | {r.get("adressaten") or "Adressaten fehlen"} | {r.get("text","")[:70]}')


def cmd_zeige(a):
    d = json.load(open(a.datei, encoding='utf-8'))
    gs, oer, andere, offen = gruppen(d, a.zielgruppe)
    worte = [w.lower() for w in a.stichwort]
    erst_offen = len(gs) - offen + 1
    sicht = [(i, g) for i, g in enumerate(gs, 1)
             if (a.offene or i < erst_offen) and (not worte or any(passt(x, worte) for x in g))]
    print(f'Zielgruppe {ZG_NAME[a.zielgruppe]}: {len(gs) - offen} Einträge, davon passend zu {worte or "allem"}: '
          f'{sum(1 for i, _ in sicht if i < erst_offen)}. Andere Zielgruppe: {andere}, OER: {len(oer)}, '
          f'ohne Adressaten: {offen}' + ('' if a.offene else ' (ausgeblendet, --offene zeigt sie)') +
          '. Nummern gelten unverändert für "notiz".')
    rest = 5000
    for i, g in sicht:
        if i < a.ab:
            continue
        z = zeile_kurz(i, g, worte)
        rest -= len(z.encode()) + 1
        if rest < 0:
            print(f'... weiter mit --ab {i} (gleiche Stichworte)')
            break
        print(z)


def zelle(s):
    return (s or '').replace('|', '/').replace('\n', ' ')


def tabelle(nrn, gs, standort):
    zeilen = ['| Titel | Mediennummer | Adressaten | Laufzeit | Jahr |', '|---|---|---|---|---|']
    for n in nrn:
        g = gs[n - 1]
        r = g[0]
        titel = f'[{zelle(r["titel"])}]({link(r, standort)})'
        if len(g) > 1:
            titel += f' (Reihe, {len(g)} Teile)'
        zeilen.append(f'| {titel} | {nummer(r)} | {zelle(r.get("adressaten") or "nicht angegeben")} | '
                      f'{r.get("laufzeit","")} | {r.get("jahr","")} |')
    return '\n'.join(zeilen)


def nummern(s, n):
    out = []
    for x in (s or '').replace(' ', '').split(','):
        if not x:
            continue
        if not x.isdigit() or not 1 <= int(x) <= n:
            raise SystemExit(f'Ungültige Nummer {x!r} - gültig sind 1 bis {n} aus "zeige".')
        if int(x) not in out:
            out.append(int(x))
    return out


def cmd_notiz(a):
    d = json.load(open(a.datei, encoding='utf-8'))
    gs, oer, andere, offen = gruppen(d, a.zielgruppe)
    kern, rand = nummern(a.kern, len(gs)), nummern(a.rand, len(gs))
    if set(kern) & set(rand):
        raise SystemExit(f'Nummern in Kern UND Grenzfällen: {sorted(set(kern) & set(rand))} - jede nur einmal.')
    st = d['standort']
    t = [f'# Edupool-Recherche: {a.thema} ({ZG_NAME[a.zielgruppe]})', '',
         f'Edupool Hessen, Standort {st}, Gast-Katalog vom {d["abgerufen"]}. '
         f'Suchbegriffe: {", ".join(f"{k} ({v})" for k, v in d["begriffe"].items())}.', '',
         '## Kernauswahl', '', tabelle(kern, gs, st), '']
    if rand:
        t += ['## Grenzfälle', '', tabelle(rand, gs, st), '']
    t += ['## Hinweise', '',
          f'- OER-Treffer (Sodix): {len(oer)}, nicht einzeln aufgeführt.',
          f'- Titel der anderen Zielgruppe ({ZG_NAME["wf" if a.zielgruppe == "gs" else "gs"]}): {andere}, weggelassen.',
          f'- Ohne Adressaten-Feld: {offen}.' if offen else '- Alle aufgeführten Titel haben ein Adressaten-Feld.',
          '- Die Gast-Sitzung zeigt den Katalog, nicht die Lizenz- oder Freischaltlage des eigenen Kontos.',
          '- Mediennummern für die Medienliste: nach dem Anmelden in die Edupool-Suche kopieren.', '']
    open(a.out, 'w', encoding='utf-8').write('\n'.join(t))
    print(f'OK: {a.out} mit {len(kern)} Kern- und {len(rand)} Grenzfall-Einträgen')


def main():
    p = argparse.ArgumentParser()
    sp = p.add_subparsers(dest='cmd', required=True)
    s = sp.add_parser('suche')
    s.add_argument('--standort', required=True, type=int)
    s.add_argument('--begriffe', required=True, nargs='+')
    s.add_argument('--max', type=int, default=100)
    s.add_argument('--out', default='treffer.json')
    z = sp.add_parser('zeige')
    z.add_argument('datei')
    z.add_argument('--zielgruppe', required=True, choices=['gs', 'wf'])
    z.add_argument('--ab', type=int, default=1)
    z.add_argument('--stichwort', nargs='*', default=[], help='Wortanfänge, z. B. fotosynth photosynth chlorophyll')
    z.add_argument('--offene', action='store_true', help='auch Einträge ohne Adressaten-Feld zeigen')
    n = sp.add_parser('notiz')
    n.add_argument('datei')
    n.add_argument('--zielgruppe', required=True, choices=['gs', 'wf'])
    n.add_argument('--thema', required=True)
    n.add_argument('--kern', required=True)
    n.add_argument('--rand', default='')
    n.add_argument('--out', default='edupool-liste.md')
    a = p.parse_args()
    try:
        {'suche': cmd_suche, 'zeige': cmd_zeige, 'notiz': cmd_notiz}[a.cmd](a)
    except PortalFehler as e:
        print(f'PORTAL-FEHLER: {e} Keine Ergebnisse erfinden - dem Nutzer melden.')
        sys.exit(2)
    except OSError as e:
        print(f'NETZ-FEHLER: {e}. Ist im Agent-Lauf das Netz für die Shell freigegeben?')
        sys.exit(3)


if __name__ == '__main__':
    main()
