"""Baut die PowerPoint-Vorlage „MindGraph Hausstil" für den Skill „PowerPoint nach Vorlage".

Aufruf:  python3 app/scripts/build-hausstil-vorlage.py
Ausgabe: app/resources/starter-skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx
Braucht: python-pptx (nur zum Entwickeln, nicht in der App)

Anders als ein mit python-pptx gemaltes Deck steckt das Design hier im Master
und in den Layouts: Logo, Farben, Schrift, Dachzeile und Fußzeile.
Nur so kann write_pptx (shared/pptxTemplate.ts) neue Folien darauf anlegen, die
genauso aussehen.

Gestaltung seit 11/2026 nach der Werkstatt-Präsentation „Agentisch arbeiten":
viel Weiß, gesperrte Dachzeile in der Akzentfarbe, Titel als Aussage, graue Karten
mit Symbolkreis, runde Ziffern mit Pfeilen, dunkle Abschnittsfolien mit großem Kreis,
zwei Balken (dunkel = Kernaussage, hell = Hinweis). Die Akzentfarbe steht nur dort,
wo etwas zu tun oder zu merken ist — der Rest bleibt grau.

Was write_pptx an Namen erkennt (nicht umbenennen): Platzhalter „Dachzeile",
„Karte n", „Schritt n", „Kennzahl n", „Kernaussage", „Merksatz"; unsichtbare Formen
„Symbol n" (Kreis je Karte bzw. Schritt), „Symbol" (Symbol der Folie), „Zeitleiste",
„Diagramm" und „Ablauf" (Flächen für gezeichnete Grafiken) geben nur die Lage vor.
Ändern sich Farben, Wortmarke oder Logo-Form, muss shared/brandDeck.ts mitziehen.
"""
import io
import re
import zipfile
from pathlib import Path

from pptx import Presentation
from pptx.util import Emu

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "app" / "resources" / "starter-skills" / "praesentation-nach-vorlage" / "MindGraph-Hausstil.pptx"
LOGO = ROOT / "docs" / "icon.png"

IN = 914400  # EMU je Zoll
W, H = 12192000, 6858000

INK = "1C2024"
MUTED = "5B636D"
RULE = "D5D9DE"
PETROL = "1F6F6A"
PETROL_PALE = "E3F0EE"
NAVY = "222B3A"
TEAL_LIGHT = "9FD3CB"
ON_NAVY = "E6EAEF"
ON_NAVY_MUTED = "B9C2CC"
AMBER = "B87912"
PANEL = "F3F4F6"
N_LAYOUTS = 25  # muss zu LAYOUTS passen (unten geprüft)

NS = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
      'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
DECL = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
GRP = ('<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
       '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>')
CLRMAP = ('<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" '
          'accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>')


def i(v):
    return int(round(v * IN))


def xfrm(x, y, cx, cy):
    return f'<a:xfrm><a:off x="{i(x)}" y="{i(y)}"/><a:ext cx="{i(cx)}" cy="{i(cy)}"/></a:xfrm>'


def rpr(size, color, bold=False, cap=False, tag="a:defRPr", spc=0, font="Arial"):
    b = ' b="1"' if bold else ' b="0"'
    c = ' cap="all"' if cap else ''
    sp = f' spc="{spc}"' if spc else ''
    return (f'<{tag} sz="{int(size * 100)}"{b}{c}{sp}><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
            f'<a:latin typeface="{font}"/><a:cs typeface="{font}"/></{tag}>')


def lvl(n, size, color, bold=False, bullet=None, mar=0.0, indent=0.0, before=0, cap=False, algn="l", after=0, line=110, spc=0, font="Arial"):
    bu = '<a:buNone/>'
    if bullet:
        char, bcol = bullet
        bu = f'<a:buClr><a:srgbClr val="{bcol}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="{char}"/>'
    sp = f'<a:spcBef><a:spcPts val="{int(before * 100)}"/></a:spcBef>' if before else ''
    sp += f'<a:spcAft><a:spcPts val="{int(after * 100)}"/></a:spcAft>' if after else ''
    return (f'<a:lvl{n}pPr marL="{i(mar)}" indent="{i(indent)}" algn="{algn}"><a:lnSpc><a:spcPct val="{line * 1000}"/></a:lnSpc>'
            f'{sp}{bu}{rpr(size, color, bold, cap, spc=spc, font=font)}</a:lvl{n}pPr>')


def ph_sp(sid, name, ph, box=None, lst="", anchor=None, text="", fill=None, insets=None):
    sppr = ''
    if box or fill:
        geo = xfrm(*box) if box else ''
        fl = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else ''
        prst = '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>' if box else ''
        sppr = f'<p:spPr>{geo}{prst}{fl}</p:spPr>'
    else:
        sppr = '<p:spPr/>'
    anc = f' anchor="{anchor}"' if anchor else ''
    ins = ''
    if insets is not None:
        ins = f' lIns="{i(insets)}" tIns="{i(insets / 2)}" rIns="{i(insets)}" bIns="{i(insets / 2)}"'
    body = f'<a:bodyPr{anc}{ins}><a:normAutofit/></a:bodyPr>' if anchor or insets is not None else '<a:bodyPr/>'
    para = f'<a:p><a:r><a:rPr lang="de-DE"/><a:t>{text}</a:t></a:r></a:p>' if text else '<a:p><a:endParaRPr lang="de-DE"/></a:p>'
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f'<p:nvPr><p:ph {ph}/></p:nvPr></p:nvSpPr>{sppr}<p:txBody>{body}<a:lstStyle>{lst}</a:lstStyle>{para}</p:txBody></p:sp>')


def shape(sid, name, box, prst="rect", fill=None, line=None, radius=None, alpha=None):
    """Feste Gestaltungsform eines Layouts (kein Platzhalter). fill=None → unsichtbar."""
    av = f'<a:avLst><a:gd name="adj" fmla="val {radius}"/></a:avLst>' if radius is not None else '<a:avLst/>'
    al = f'<a:alpha val="{alpha}"/>' if alpha else ''
    fl = f'<a:solidFill><a:srgbClr val="{fill}">{al}</a:srgbClr></a:solidFill>' if fill else '<a:noFill/>'
    ln = f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="{prst}">{av}</a:prstGeom>{fl}{ln}</p:spPr>'
            '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>')


def rect(sid, name, box, color):
    return shape(sid, name, box, fill=color)


def round_rect(sid, name, box, color, radius=6000):
    return shape(sid, name, box, prst="roundRect", fill=color, radius=radius)


def textbox(sid, name, box, text, size, color, bold=False, algn=None):
    al = f'<a:pPr algn="{algn}"/>' if algn else ''
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>'
            f'<a:p>{al}<a:r>{rpr(size, color, bold, tag="a:rPr").replace("<a:rPr ", "<a:rPr lang=\"de-DE\" ")}<a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp>')


def card_ph(sid, name, idx, box, lst, fill=PANEL, anchor="t", inset=0.2, radius=5000, top=None, left=None, ph='type="body" sz="quarter"', line=None, first_lvl=1):
    """Text-Platzhalter mit Kartenhintergrund (abgerundet). Die Füllung erbt die Folie
    vom Layout; write_pptx kann sie für eine Hervorhebung überschreiben. fill=None →
    durchsichtig (die Fläche zeichnet dann das Layout, z. B. bei „Schritte").
    top/left: größerer Innenabstand, wenn dort ein Symbolkreis oder eine Ziffer sitzt."""
    fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    ln = f'<a:ln w="9525"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else '<a:ln><a:noFill/></a:ln>'
    t = inset if top is None else top
    l = inset if left is None else left
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f'<p:nvPr><p:ph {ph} idx="{idx}"/></p:nvPr></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {radius}"/></a:avLst></a:prstGeom>'
            f'{fill_xml}{ln}</p:spPr>'
            f'<p:txBody><a:bodyPr lIns="{i(l)}" tIns="{i(t)}" rIns="{i(inset)}" bIns="{i(inset)}" anchor="{anchor}"><a:normAutofit/></a:bodyPr>'
            # Kein Mustertext: LibreOffice übernimmt eigene Layout-Platzhalter als sichtbare
            # Textfelder — ein „Karte 1" stünde dort auf jeder Folie (real, 01.10.2026).
            f'<a:lstStyle>{lst}</a:lstStyle><a:p><a:pPr lvl="{first_lvl}"/><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>')


# ── Raster ──────────────────────────────────────────────────────────────────
MX = 0.6            # Seitenrand
CW = 12.13          # Inhaltsbreite
TOP = 1.95          # Oberkante Inhalt
BOTTOM = 6.45       # Unterkante Inhalt
BAR_Y, BAR_H = 5.5, 0.95   # Balken (Kernaussage/Hinweis) unter gekürztem Inhalt
SHORT_H = BAR_Y - 0.3 - TOP  # Inhaltshöhe, wenn darunter ein Balken steht
DISC = 0.62         # Symbolkreis einer Karte
NUM = 0.46          # Ziffernkreis

# Ebenen einer Karte: 1 = Rubrik (klein, Akzent, gesperrt), 2 = Titel, 3 = Text.
CARD_LST = (lvl(1, 9, PETROL, bold=True, cap=True, after=2, spc=80)
            + lvl(2, 16, INK, bold=True, before=2, line=105)
            + lvl(3, 13, INK, before=6, line=120))
STEP_LST = CARD_LST
# Zeile einer Punkteliste: Titel fett, Text grau darunter.
ROW_LST = (lvl(1, 9, PETROL, bold=True, cap=True, spc=80)
           + lvl(2, 15, INK, bold=True, line=105)
           + lvl(3, 12.5, MUTED, before=2, line=115))
# Kennzahl: 2 = die Zahl selbst, groß in der Akzentfarbe.
STAT_LST = (lvl(1, 10, PETROL, bold=True, cap=True, after=4, spc=80)
            + lvl(2, 44, PETROL, bold=True, line=100)
            + lvl(3, 14, MUTED, before=6, line=115))
BANNER_LST = lvl(1, 15, "FFFFFF", bold=True, line=115)
NOTE_LST = lvl(1, 14, INK, bold=True, line=115)
QUOTE_LST = lvl(1, 22, "FFFFFF", bold=True, line=115)
PANEL_LST = (lvl(1, 15, INK, bullet=("•", PETROL), mar=0.26, indent=-0.26, before=7)
             + lvl(2, 13, MUTED, bullet=("–", MUTED), mar=0.55, indent=-0.24, before=3)
             + lvl(3, 12, MUTED, bullet=("–", MUTED), mar=0.85, indent=-0.22, before=2))
MONO_LST = (lvl(1, 12, INK, font="Courier New", mar=0.34, indent=-0.34, before=3, line=120)
            + lvl(2, 12, MUTED, font="Courier New", mar=0.3, before=2, line=120))


def banner(sid, y=BAR_Y, h=BAR_H):
    """Dunkler Balken: die eine Aussage der Folie."""
    return card_ph(sid, "Kernaussage", 30, (MX, y, CW, h), BANNER_LST, fill=NAVY, anchor="ctr", inset=0.3, radius=4000, first_lvl=0)


def note_bar(sid, y=BAR_Y, h=BAR_H):
    """Heller Balken in der getönten Akzentfarbe: Hinweis, Achtung, Arbeitsauftrag."""
    return card_ph(sid, "Merksatz", 30, (MX, y, CW, h), NOTE_LST, fill=PETROL_PALE, anchor="ctr", inset=0.3, radius=4000, first_lvl=0)


def columns(count, gap):
    w = (CW - gap * (count - 1)) / count
    return [(MX + k * (w + gap), w) for k in range(count)]


def cards(sid, count, y=TOP, h=4.0, lst=CARD_LST, word="Karte", gap=0.22, fill=PANEL, icons=True):
    """Karten nebeneinander. Mit icons=True sitzt oben links ein Symbolkreis: das Layout
    gibt mit der unsichtbaren Form „Symbol n" nur die Lage vor, Kreis und Symbol zeichnet
    write_pptx auf die Folie (über der Karte — Layout-Formen lägen darunter)."""
    out = ''
    for k, (x, w) in enumerate(columns(count, gap)):
        out += card_ph(sid + k, f"{word} {k + 1}", 20 + k, (x, y, w, h), lst, fill=fill, top=(0.22 + DISC + 0.22) if icons else None)
    if icons:
        for k, (x, w) in enumerate(columns(count, gap)):
            out += shape(sid + 50 + k, f"Symbol {k + 1}", (x + 0.2, y + 0.22, DISC, DISC), prst="ellipse")
    return out


def numeral(sid, k, x, y):
    return (shape(sid, f"Ziffer {k + 1} Fläche", (x, y, NUM, NUM), prst="ellipse", fill=PETROL)
            + textbox(sid + 1, f"Ziffer {k + 1}", (x, y, NUM, NUM), str(k + 1), 14, "FFFFFF", bold=True, algn="ctr"))


def steps(sid, count, y=TOP, h=SHORT_H, gap=0.42):
    """Schritte nebeneinander: Fläche, runde Ziffer und Pfeil zum nächsten Schritt sind feste
    Gestaltung des Layouts. Sie müssen im Layout liegen, nicht im Platzhalter: Folien-
    Platzhalter werden ÜBER die Layout-Formen gezeichnet — ein gefüllter Platzhalter
    verdeckte die Ziffern. Deshalb sind die Platzhalter durchsichtig."""
    out = ''
    cols = columns(count, gap)
    for k, (x, w) in enumerate(cols):
        out += round_rect(sid + 40 + k, f"Schritt {k + 1} Fläche", (x, y, w, h), PANEL, radius=5000)
    for k, (x, w) in enumerate(cols):
        out += numeral(sid + 60 + 2 * k, k, x + 0.2, y + 0.22)
        if k < count - 1:
            out += shape(sid + 80 + k, f"Pfeil {k + 1}", (x + w + 0.1, y + h / 2 - 0.11, gap - 0.2, 0.22), prst="rightArrow", fill=PETROL)
    for k, (x, w) in enumerate(cols):
        out += card_ph(sid + k, f"Schritt {k + 1}", 20 + k, (x, y, w, h), STEP_LST, fill=None, top=0.22 + NUM + 0.2)
    # Symbol oben rechts im Schritt — nur die Lage; write_pptx zeichnet es, wenn eines genannt ist.
    for k, (x, w) in enumerate(cols):
        out += shape(sid + 90 + k, f"Symbol {k + 1}", (x + w - 0.2 - NUM, y + 0.22, NUM, NUM), prst="ellipse")
    return out


def rows(sid, count, x=MX, w=CW, y=TOP, h=BOTTOM - TOP, gap=0.16):
    """Nummerierte Zeilen untereinander (Leitfragen, Zusammenfassung, Prüfpunkte)."""
    rh = (h - gap * (count - 1)) / count
    out = ''
    for k in range(count):
        out += round_rect(sid + 40 + k, f"Schritt {k + 1} Fläche", (x, y + k * (rh + gap), w, rh), PANEL, radius=min(16000, int(5000 * 1.4 / rh)))
    for k in range(count):
        out += numeral(sid + 60 + 2 * k, k, x + 0.22, y + k * (rh + gap) + (rh - NUM) / 2)
    for k in range(count):
        out += card_ph(sid + k, f"Schritt {k + 1}", 20 + k, (x, y + k * (rh + gap), w, rh), ROW_LST, fill=None, anchor="ctr", inset=0.08, left=0.22 + NUM + 0.24)
    return out


def picture(sid, name, rid, box):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')


# ── Bausteine, die mehrere Layouts teilen ───────────────────────────────────
FOOTER_TEXT = 'MindGraph Notes · {{ANLASS}}'


def kicker(sid, color=PETROL, y=0.4, w=9.0):
    return ph_sp(sid, "Dachzeile", 'type="body" sz="quarter" idx="13"', (MX, y, w, 0.28),
                 lst=lvl(1, 9.5, color, bold=True, cap=True, spc=120), anchor="b", insets=0.0, text="")


def footer(sid):
    return (ph_sp(sid, "Fußzeile", 'type="ftr" sz="quarter" idx="11"', text=FOOTER_TEXT)
            + ph_sp(sid + 1, "Foliennummer", 'type="sldNum" sz="quarter" idx="12"').replace(
                '<a:p><a:endParaRPr lang="de-DE"/></a:p>',
                '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="de-DE"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="de-DE"/></a:p>'))


def head(sid=2):
    """Dachzeile + Titel — der Kopf jeder Inhaltsfolie."""
    return kicker(sid) + ph_sp(sid + 1, "Titel", 'type="title"')


def layout(name, typ, shapes, show_master=True, bg=None, extra_attrs=''):
    sm = '' if show_master else ' showMasterSp="0"'
    bgx = f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' if bg else ''
    return (f'{DECL}<p:sldLayout {NS} type="{typ}" preserve="1"{sm}{extra_attrs}><p:cSld name="{name}">{bgx}<p:spTree>{GRP}{shapes}</p:spTree></p:cSld>'
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')


def title_slide(with_picture):
    tw = 6.1 if with_picture else 11.8
    pic = ph_sp(7, "Bild", 'type="pic" idx="2"', (7.4, 0, W / IN - 7.4, 7.5), text="") if with_picture else ''
    return (rect(2, "Akzentbalken", (0, 0, 0.28, 7.5), PETROL)
            + pic
            + picture(3, "Logo", "rId2", (0.75, 0.6, 0.55, 0.55))
            + textbox(4, "Wortmarke", (1.45, 0.66, 4.0, 0.42), "MindGraph Notes", 16, INK, bold=True)
            + ph_sp(5, "Titel", 'type="ctrTitle"', (0.75, 1.9, tw, 2.3), lst=lvl(1, 32 if with_picture else 38, INK, bold=True, line=105), anchor="b", insets=0.0, text="Titel der Präsentation")
            + ph_sp(6, "Untertitel", 'type="subTitle" idx="1"', (0.75, 4.45, tw, 1.4), lst=lvl(1, 15 if with_picture else 17, MUTED, line=125), anchor="t", insets=0.0, text="Untertitel · Anlass · Datum"))


def panel(sid, name, idx, x, w, y=TOP, h=BOTTOM - TOP):
    """Inhaltsfläche als graue Tafel — zwei davon ergeben die Gegenüberstellung."""
    return card_ph(sid, name, idx, (x, y, w, h), PANEL_LST, ph='sz="half"', inset=0.32, first_lvl=0)


# ── Master ──────────────────────────────────────────────────────────────────
MASTER = (
    f'{DECL}<p:sldMaster {NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{GRP}'
    + ph_sp(2, "Titel", 'type="title"', (MX, 0.72, CW, 0.95), anchor="t", insets=0.0, text="Titel der Folie")
    + ph_sp(3, "Text", 'type="body" idx="1"', (MX, TOP, CW, BOTTOM - TOP), insets=0.05, text="Text")
    + ph_sp(4, "Fußzeile", 'type="ftr" sz="quarter" idx="11"', (MX, 7.0, 10.0, 0.28), anchor="ctr", insets=0.0,
            lst=lvl(1, 8, MUTED))
    + ph_sp(5, "Foliennummer", 'type="sldNum" sz="quarter" idx="12"', (11.73, 7.0, 1.0, 0.28), anchor="ctr", insets=0.0,
            lst=lvl(1, 8, MUTED, algn="r"))
    + '</p:spTree></p:cSld>' + CLRMAP
    + '<p:sldLayoutIdLst>' + ''.join(f'<p:sldLayoutId id="{2147483649 + n}" r:id="rId{n + 1}"/>' for n in range(N_LAYOUTS)) + '</p:sldLayoutIdLst>'
    + '<p:hf hdr="0" dt="0"/>'
    + '<p:txStyles>'
    + f'<p:titleStyle>{lvl(1, 24, INK, bold=True, line=105)}</p:titleStyle>'
    + '<p:bodyStyle>'
    + lvl(1, 17, INK, bullet=("•", PETROL), mar=0.3, indent=-0.3, before=9)
    + lvl(2, 15, INK, bullet=("–", MUTED), mar=0.65, indent=-0.28, before=4)
    + lvl(3, 13, MUTED, bullet=("–", MUTED), mar=1.0, indent=-0.25, before=2)
    + lvl(4, 13, MUTED, bullet=("–", MUTED), mar=1.3, indent=-0.25, before=2)
    + '</p:bodyStyle>'
    + f'<p:otherStyle>{lvl(1, 17, INK)}</p:otherStyle>'
    + '</p:txStyles></p:sldMaster>'
)

HALF = (CW - 0.29) / 2
RIGHT = MX + HALF + 0.29
DARK_BODY = (lvl(1, 16, ON_NAVY, bullet=("–", TEAL_LIGHT), mar=0.3, indent=-0.3, before=8)
             + lvl(2, 14, ON_NAVY_MUTED, bullet=("–", ON_NAVY_MUTED), mar=0.65, indent=-0.28, before=4))

# ── Layouts ─────────────────────────────────────────────────────────────────
# Reihenfolge zählt: die Automatik von write_pptx nimmt je Art das erste passende Layout.
LAYOUTS = [
    # Titelfolie: Akzentbalken links, Logo + Wortmarke, großer Titel, Untertitel grau.
    ("Titelfolie", layout("Titelfolie", "title", title_slide(False), show_master=False), True),
    # Titelfolie mit Bild: rechte Hälfte ein randloses Bild.
    ("Titelfolie mit Bild", layout("Titelfolie mit Bild", "title", title_slide(True), show_master=False), True),
    ("Titel und Inhalt", layout("Titel und Inhalt", "obj",
        head() + ph_sp(4, "Inhalt", 'idx="1"', text="Text") + footer(5)), False),
    # Zwei Inhalte: zwei graue Tafeln — Gegenüberstellung, erste Zeile fett als Kopf.
    ("Zwei Inhalte", layout("Zwei Inhalte", "twoObj",
        head() + panel(4, "Inhalt links", 1, MX, HALF) + panel(5, "Inhalt rechts", 2, RIGHT, HALF) + footer(6)), False),
    # Abschnitt: dunkler Grund, rechts ein großer heller Kreis mit dem Symbol des Teils.
    ("Abschnitt", layout("Abschnitt", "secHead",
        shape(5, "Kreis", (8.95, 1.95, 3.6, 3.6), prst="ellipse", fill="FFFFFF", alpha=11000)
        + shape(6, "Symbol", (10.0, 3.0, 1.5, 1.5))
        + kicker(2, color=TEAL_LIGHT, y=2.55, w=7.8)
        + ph_sp(3, "Titel", 'type="title"', (MX, 2.9, 7.8, 1.25), lst=lvl(1, 32, "FFFFFF", bold=True, line=105), anchor="ctr", insets=0.0, text="Abschnitt")
        + ph_sp(4, "Text", 'type="body" idx="1"', (MX, 4.3, 7.8, 1.1), lst=lvl(1, 15, ON_NAVY_MUTED, line=125), anchor="t", insets=0.0, text="Worum es in diesem Teil geht"),
        show_master=False, bg=NAVY), False),
    ("Nur Titel", layout("Nur Titel", "titleOnly", head() + footer(4)), False),
    # Bild mit Text: Text links, Bild rechts.
    ("Bild mit Text", layout("Bild mit Text", "picTx",
        head()
        + ph_sp(4, "Bild", 'type="pic" idx="1"', (RIGHT, TOP, HALF, BOTTOM - TOP), text="")
        + ph_sp(5, "Text", 'type="body" sz="half" idx="2"', (MX, TOP, HALF, BOTTOM - TOP),
                lst=lvl(1, 16, INK, bullet=("•", PETROL), mar=0.3, indent=-0.3, before=7), text="Text")
        + footer(6)), False),
    # Abschluss: dunkel, heller Text — Vorschlag, nächste Schritte, Kontakt.
    ("Abschluss", layout("Abschluss", "cust",
        kicker(2, color=TEAL_LIGHT, y=0.5)
        + ph_sp(3, "Titel", 'type="title"', (MX, 0.85, CW, 1.15), lst=lvl(1, 30, "FFFFFF", bold=True), anchor="t", insets=0.0, text="Nächste Schritte")
        + ph_sp(4, "Inhalt", 'idx="1"', (MX, 2.2, CW, 4.4), lst=DARK_BODY, text="Text"),
        show_master=False, bg=NAVY), False),
    # Karten mit Symbolkreis.
    ("Drei Karten", layout("Drei Karten", "cust", head() + cards(4, 3) + footer(8)), False),
    ("Vier Karten", layout("Vier Karten", "cust", head() + cards(4, 4, gap=0.2) + footer(9)), False),
    # Karten mit Kernaussage: kürzere Karten, darunter der dunkle Balken.
    ("Karten mit Kernaussage", layout("Karten mit Kernaussage", "cust",
        head() + cards(4, 3, h=SHORT_H) + banner(8) + footer(9)), False),
    ("Vier Karten mit Kernaussage", layout("Vier Karten mit Kernaussage", "cust",
        head() + cards(4, 4, h=SHORT_H, gap=0.2) + banner(8) + footer(9)), False),
    ("Text mit Kernaussage", layout("Text mit Kernaussage", "cust",
        head() + ph_sp(4, "Inhalt", 'idx="1"', (MX, TOP, CW, SHORT_H), text="Text") + banner(5) + footer(6)), False),
    # Schritte: runde Ziffern, Pfeile dazwischen, darunter optional der helle Hinweisbalken.
    # Getrennte Layouts, weil Ziffern und Flächen fest im Layout stehen.
    ("Drei Schritte", layout("Drei Schritte", "cust", head() + steps(4, 3) + note_bar(8) + footer(9)), False),
    ("Vier Schritte", layout("Vier Schritte", "cust", head() + steps(4, 4, gap=0.38) + note_bar(8) + footer(9)), False),
    # Kennzahlen: drei große Zahlen auf getöntem Grund, darunter optional die Einordnung.
    ("Kennzahlen", layout("Kennzahlen", "cust",
        head() + cards(4, 3, y=TOP + 0.1, h=SHORT_H - 0.2, lst=STAT_LST, word="Kennzahl", fill=PETROL_PALE, icons=False)
        + banner(8) + footer(9)), False),
    # Punktelisten: nummerierte Zeilen über die ganze Breite.
    ("Drei Punkte", layout("Drei Punkte", "cust", head() + rows(4, 3) + footer(9)), False),
    ("Vier Punkte", layout("Vier Punkte", "cust", head() + rows(4, 4) + footer(9)), False),
    ("Fünf Punkte", layout("Fünf Punkte", "cust", head() + rows(4, 5, gap=0.13) + footer(9)), False),
    # Vier Punkte mit Kernaussage: links die dunkle Tafel mit dem Satz, rechts die Punkte dazu.
    ("Vier Punkte mit Kernaussage", layout("Vier Punkte mit Kernaussage", "cust",
        head()
        + card_ph(8, "Kernaussage", 30, (MX, TOP, 4.2, BOTTOM - TOP), QUOTE_LST, fill=NAVY, anchor="ctr", inset=0.4, radius=4000, first_lvl=0)
        + rows(4, 4, x=MX + 4.2 + 0.3, w=CW - 4.2 - 0.3) + footer(9)), False),
    # Dokument und Erläuterung: links ein „Blatt" in Schreibmaschinenschrift (Beispieldatei,
    # Auftragstext, Auszug), rechts die Erklärung. Blatt und Kopfleiste zeichnet das Layout.
    ("Dokument und Erläuterung", layout("Dokument und Erläuterung", "cust",
        head()
        + shape(10, "Blatt", (MX, TOP, 5.7, BOTTOM - TOP), prst="roundRect", fill="FFFFFF", line=RULE, radius=2500)
        + shape(11, "Blatt Kopfleiste", (MX + 0.01, TOP + 0.01, 5.68, 0.36), fill=PANEL)
        + ''.join(shape(12 + k, f"Blatt Punkt {k + 1}", (MX + 0.2 + k * 0.2, TOP + 0.13, 0.12, 0.12), prst="ellipse", fill=RULE) for k in range(3))
        + card_ph(4, "Dokument", 1, (MX, TOP, 5.7, BOTTOM - TOP), MONO_LST, fill=None, ph='sz="half"', inset=0.3, top=0.6, first_lvl=0)
        + ph_sp(5, "Erläuterung", 'sz="half" idx="2"', (MX + 5.7 + 0.4, TOP, CW - 5.7 - 0.4, BOTTOM - TOP),
                lst=lvl(1, 15, INK, bullet=("•", PETROL), mar=0.28, indent=-0.28, before=8)
                + lvl(2, 13, MUTED, bullet=("–", MUTED), mar=0.58, indent=-0.24, before=3), text="Text")
        + footer(6)), False),
    # Zeitleiste und Balkendiagramm: das Layout gibt mit einer unsichtbaren Form nur die
    # Fläche vor, die Blöcke bzw. Balken zeichnet write_pptx (shared/pptxGraphics.ts).
    ("Zeitleiste", layout("Zeitleiste", "cust",
        head() + shape(10, "Zeitleiste", (MX, TOP, CW, BOTTOM - TOP)) + footer(4)), False),
    ("Ablauf mit Schleife", layout("Ablauf mit Schleife", "cust",
        head() + shape(10, "Ablauf", (MX, TOP, CW, SHORT_H)) + note_bar(8) + footer(4)), False),
    ("Balkendiagramm", layout("Balkendiagramm", "cust",
        head() + shape(10, "Diagramm", (MX, TOP, CW, SHORT_H)) + banner(8) + footer(4)), False),
    ("Balkendiagramm mit Text", layout("Balkendiagramm mit Text", "cust",
        head() + shape(10, "Diagramm", (MX, TOP, 6.9, BOTTOM - TOP))
        + ph_sp(5, "Erläuterung", 'idx="1"', (MX + 6.9 + 0.45, TOP, CW - 6.9 - 0.45, BOTTOM - TOP),
                lst=lvl(1, 15, INK, bullet=("•", PETROL), mar=0.28, indent=-0.28, before=10)
                + lvl(2, 13, MUTED, bullet=None, mar=0.28, before=2), text="Text")
        + footer(6)), False),
]
assert len(LAYOUTS) == N_LAYOUTS, "N_LAYOUTS anpassen"


def theme_xml(src: str) -> str:
    """Farben und Schriften des Themes auf den Hausstil setzen (Arial, Petrol)."""
    colors = {"dk1": INK, "lt1": "FFFFFF", "dk2": NAVY, "lt2": "F3F4F6", "accent1": PETROL, "accent2": AMBER,
              "accent3": "2B8A57", "accent4": "B83E3E", "accent5": MUTED, "accent6": TEAL_LIGHT, "hlink": PETROL, "folHlink": MUTED}
    for k, v in colors.items():
        src = re.sub(rf'<a:{k}>.*?</a:{k}>', f'<a:{k}><a:srgbClr val="{v}"/></a:{k}>', src, flags=re.S)
    src = re.sub(r'(<a:(?:major|minor)Font>\s*<a:latin typeface=")[^"]*', r'\1Arial', src)
    src = re.sub(r'<a:clrScheme name="[^"]*"', '<a:clrScheme name="MindGraph"', src)
    src = re.sub(r'<a:fontScheme name="[^"]*"', '<a:fontScheme name="MindGraph"', src)
    return re.sub(r'<a:theme ([^>]*)name="[^"]*"', r'<a:theme \1name="MindGraph Hausstil"', src, count=1)


def rels(items):
    body = ''.join(f'<Relationship Id="{rid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/{t}" Target="{target}"/>'
                   for rid, t, target in items)
    return f'{DECL}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">{body}</Relationships>'


def main():
    prs = Presentation()
    prs.slide_width, prs.slide_height = Emu(W), Emu(H)
    # Dokumenteigenschaften über die API — ein zweites <dc:title> per Hand ließ
    # PowerPoint die ganze Datei „reparieren" (real, 01.10.2026).
    cp = prs.core_properties
    cp.title = "MindGraph Hausstil"
    cp.author = "MindGraph Notes"
    cp.last_modified_by = "MindGraph Notes"
    cp.description = "Vorlage für den Skill „PowerPoint nach Vorlage“"
    cp.revision = 1
    buf = io.BytesIO()
    prs.save(buf)
    src = zipfile.ZipFile(io.BytesIO(buf.getvalue()))

    out = io.BytesIO()
    z = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
    for item in src.infolist():
        name = item.filename
        if name.startswith("ppt/slideLayouts/") or name.startswith("ppt/slideMasters/") or name.endswith("thumbnail.jpeg"):
            continue
        data = src.read(name)
        if name == "ppt/theme/theme1.xml":
            data = theme_xml(data.decode("utf-8")).encode("utf-8")
        elif name == "[Content_Types].xml":
            ct = data.decode("utf-8")
            ct = re.sub(r'<Override PartName="/ppt/slideLayouts/[^"]+"[^>]*/>', '', ct)
            ct = re.sub(r'<Override PartName="/docProps/thumbnail.jpeg"[^>]*/>', '', ct)
            ct = ct.replace('</Types>', ''.join(
                f'<Override PartName="/ppt/slideLayouts/slideLayout{n + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
                for n in range(len(LAYOUTS))) + '</Types>')
            if 'Extension="png"' not in ct:
                ct = ct.replace('<Default Extension="xml"', '<Default Extension="png" ContentType="image/png"/><Default Extension="xml"')
            data = ct.encode("utf-8")
        elif name == "_rels/.rels":
            data = re.sub(rb'<Relationship [^>]*thumbnail[^>]*/>', b'', data)
        elif name == "ppt/presentation.xml":
            data = data.replace(b' type="screen4x3"', b'')
        z.writestr(name, data)

    z.writestr("ppt/slideMasters/slideMaster1.xml", MASTER)
    z.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels",
               rels([(f"rId{n + 1}", "slideLayout", f"../slideLayouts/slideLayout{n + 1}.xml") for n in range(len(LAYOUTS))]
                    + [(f"rId{len(LAYOUTS) + 1}", "theme", "../theme/theme1.xml")]))
    for n, (_, xml, uses_logo) in enumerate(LAYOUTS):
        z.writestr(f"ppt/slideLayouts/slideLayout{n + 1}.xml", xml)
        items = [("rId1", "slideMaster", "../slideMasters/slideMaster1.xml")]
        if uses_logo:
            items.append(("rId2", "image", "../media/mg-logo.png"))
        z.writestr(f"ppt/slideLayouts/_rels/slideLayout{n + 1}.xml.rels", rels(items))
    z.writestr("ppt/media/mg-logo.png", LOGO.read_bytes())
    z.close()
    OUT.write_bytes(out.getvalue())
    print("geschrieben:", OUT, len(out.getvalue()), "Bytes")


if __name__ == "__main__":
    main()
