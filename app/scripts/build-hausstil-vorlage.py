"""Baut die PowerPoint-Vorlage „MindGraph Hausstil" für den Skill „PowerPoint nach Vorlage".

Aufruf:  python3 app/scripts/build-hausstil-vorlage.py
Ausgabe: app/resources/starter-skills/praesentation-nach-vorlage/MindGraph-Hausstil.pptx
Braucht: python-pptx (nur zum Entwickeln, nicht in der App)

Anders als ein mit python-pptx gemaltes Deck steckt das Design hier im Master
und in den Layouts: Logo, Farben, Schrift, Trennlinie, Dachzeile und Fußzeile.
Nur so kann write_pptx (shared/pptxTemplate.ts) neue Folien darauf anlegen, die
genauso aussehen. Gestaltung nach dem Einkaufs-Deck 09/2026: 16:9, Arial,
Weiß mit Petrol-Akzent, Dachzeile in Großbuchstaben, dunkler Abschluss.
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
N_LAYOUTS = 14  # muss zu LAYOUTS passen (unten geprüft)

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


def rpr(size, color, bold=False, cap=False, tag="a:defRPr"):
    b = ' b="1"' if bold else ' b="0"'
    c = ' cap="all"' if cap else ''
    return (f'<{tag} sz="{int(size * 100)}"{b}{c}><a:solidFill><a:srgbClr val="{color}"/></a:solidFill>'
            f'<a:latin typeface="Arial"/><a:cs typeface="Arial"/></{tag}>')


def lvl(n, size, color, bold=False, bullet=None, mar=0.0, indent=0.0, before=0, cap=False, algn="l", after=0, line=110):
    bu = '<a:buNone/>'
    if bullet:
        char, bcol = bullet
        bu = f'<a:buClr><a:srgbClr val="{bcol}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="{char}"/>'
    spc = f'<a:spcBef><a:spcPts val="{int(before * 100)}"/></a:spcBef>' if before else ''
    spc += f'<a:spcAft><a:spcPts val="{int(after * 100)}"/></a:spcAft>' if after else ''
    return (f'<a:lvl{n}pPr marL="{i(mar)}" indent="{i(indent)}" algn="{algn}"><a:lnSpc><a:spcPct val="{line * 1000}"/></a:lnSpc>'
            f'{spc}{bu}{rpr(size, color, bold, cap)}</a:lvl{n}pPr>')


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


def rect(sid, name, box, color):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>'
            '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>')


def textbox(sid, name, box, text, size, color, bold=False):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr txBox="1"/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr>'
            f'<p:txBody><a:bodyPr wrap="none" lIns="0" tIns="0" rIns="0" bIns="0" anchor="ctr"/><a:lstStyle/>'
            f'<a:p><a:r>{rpr(size, color, bold, tag="a:rPr").replace("<a:rPr ", "<a:rPr lang=\"de-DE\" ")}<a:t>{text}</a:t></a:r></a:p></p:txBody></p:sp>')


def card_ph(sid, name, idx, box, lst, fill=PANEL, anchor="t", inset=0.18, radius=6000):
    """Text-Platzhalter mit Kartenhintergrund (abgerundet). Die Füllung erbt die Folie
    vom Layout; write_pptx kann sie für eine Hervorhebung überschreiben. fill=None →
    durchsichtig (die Fläche zeichnet dann das Layout, z. B. bei „Schritte")."""
    fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else '<a:noFill/>'
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>'
            f'<p:nvPr><p:ph type="body" sz="quarter" idx="{idx}"/></p:nvPr></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {radius}"/></a:avLst></a:prstGeom>'
            f'{fill_xml}<a:ln><a:noFill/></a:ln></p:spPr>'
            f'<p:txBody><a:bodyPr lIns="{i(inset)}" tIns="{i(inset)}" rIns="{i(inset)}" bIns="{i(inset)}" anchor="{anchor}"><a:normAutofit/></a:bodyPr>'
            # Kein Mustertext: LibreOffice übernimmt eigene Layout-Platzhalter als sichtbare
            # Textfelder — ein „Karte 1" stünde dort auf jeder Folie (real, 01.10.2026).
            f'<a:lstStyle>{lst}</a:lstStyle><a:p><a:pPr lvl="1"/><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>')


# Ebenen einer Karte: 1 = Rubrik (klein, Petrol, Großbuchstaben), 2 = Titel, 3 = Text.
CARD_LST = (lvl(1, 9, PETROL, bold=True, cap=True, after=2)
            + lvl(2, 15, INK, bold=True, before=2, line=105)
            + lvl(3, 11.5, INK, before=6, line=120))
# Schritt: Titel rückt neben das Ziffernkästchen.
STEP_LST = (lvl(1, 9, PETROL, bold=True, cap=True, after=2)
            + lvl(2, 15, INK, bold=True, mar=0.62, line=105)
            + lvl(3, 11.5, INK, before=10, line=120))
# Kennzahl: 2 = die Zahl selbst, groß in Petrol.
STAT_LST = (lvl(1, 10, PETROL, bold=True, cap=True, after=4)
            + lvl(2, 44, PETROL, bold=True, line=100)
            + lvl(3, 14, MUTED, before=6, line=115))
BANNER_LST = lvl(1, 16, "FFFFFF", bold=True, line=115)


def banner(sid, y=5.45, h=1.15):
    return card_ph(sid, "Kernaussage", 30, (0.6, y, 12.13, h), BANNER_LST, fill=NAVY, anchor="ctr", inset=0.28, radius=4000).replace(
        '<a:pPr lvl="1"/>', '<a:pPr lvl="0"/>')


def cards(sid, count, y=1.9, h=4.6, lst=CARD_LST, word="Karte", gap=0.22, fill=PANEL):
    w = (12.13 - gap * (count - 1)) / count
    return ''.join(card_ph(sid + k, f"{word} {k + 1}", 20 + k, (0.6 + k * (w + gap), y, w, h), lst, fill=fill) for k in range(count))


def round_rect(sid, name, box, color, radius=6000):
    return (f'<p:sp><p:nvSpPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvSpPr/><p:nvPr userDrawn="1"/></p:nvSpPr>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="roundRect"><a:avLst><a:gd name="adj" fmla="val {radius}"/></a:avLst></a:prstGeom>'
            f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr>'
            '<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr lang="de-DE"/></a:p></p:txBody></p:sp>')


def step_numbers(sid, count, y=1.9, h=3.2, gap=0.22):
    """Kartenflächen und Ziffernkästchen 1…n als feste Gestaltung des Layouts.
    Sie müssen im Layout liegen, nicht im Platzhalter: Folien-Platzhalter werden ÜBER
    die Layout-Formen gezeichnet — ein gefüllter Platzhalter verdeckte die Ziffern."""
    w = (12.13 - gap * (count - 1)) / count
    out = ''
    for k in range(count):
        out += round_rect(sid + 40 + k, f"Schritt {k + 1} Fläche", (0.6 + k * (w + gap), y, w, h), PANEL)
    for k in range(count):
        x = 0.6 + k * (w + gap) + 0.18
        out += rect(sid + 2 * k, f"Ziffer {k + 1} Fläche", (x, y + 0.18, 0.42, 0.42), PETROL)
        out += textbox(sid + 2 * k + 1, f"Ziffer {k + 1}", (x, y + 0.18, 0.42, 0.42), str(k + 1), 15, "FFFFFF", bold=True).replace(
            '<a:p><a:r>', '<a:p><a:pPr algn="ctr"/><a:r>')
    return out


def picture(sid, name, rid, box):
    return (f'<p:pic><p:nvPicPr><p:cNvPr id="{sid}" name="{name}"/><p:cNvPicPr><a:picLocks noChangeAspect="1"/></p:cNvPicPr><p:nvPr userDrawn="1"/></p:nvPicPr>'
            f'<p:blipFill><a:blip r:embed="{rid}"/><a:stretch><a:fillRect/></a:stretch></p:blipFill>'
            f'<p:spPr>{xfrm(*box)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>')


# ── Bausteine, die mehrere Layouts teilen ───────────────────────────────────
KICKER_LST = lvl(1, 10, PETROL, bold=True, cap=True)
FOOTER_TEXT = 'MindGraph Notes · {{ANLASS}}'


def kicker(sid, color=PETROL, y=0.35):
    return ph_sp(sid, "Dachzeile", 'type="body" sz="quarter" idx="13"', (0.6, y, 9.0, 0.3),
                 lst=lvl(1, 10, color, bold=True, cap=True), anchor="b", insets=0.0, text="")


def footer(sid):
    return (ph_sp(sid, "Fußzeile", 'type="ftr" sz="quarter" idx="11"', text=FOOTER_TEXT)
            + ph_sp(sid + 1, "Foliennummer", 'type="sldNum" sz="quarter" idx="12"').replace(
                '<a:p><a:endParaRPr lang="de-DE"/></a:p>',
                '<a:p><a:fld id="{B6F15528-21DE-4FAA-801E-634DDDAF4B2B}" type="slidenum"><a:rPr lang="de-DE"/><a:t>‹#›</a:t></a:fld><a:endParaRPr lang="de-DE"/></a:p>'))


def layout(name, typ, shapes, show_master=True, bg=None, extra_attrs=''):
    sm = '' if show_master else ' showMasterSp="0"'
    bgx = f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{bg}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>' if bg else ''
    return (f'{DECL}<p:sldLayout {NS} type="{typ}" preserve="1"{sm}{extra_attrs}><p:cSld name="{name}">{bgx}<p:spTree>{GRP}{shapes}</p:spTree></p:cSld>'
            '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>')


# ── Master ──────────────────────────────────────────────────────────────────
MASTER = (
    f'{DECL}<p:sldMaster {NS}><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree>{GRP}'
    + ph_sp(2, "Titel", 'type="title"', (0.6, 0.62, 12.1, 0.9), anchor="t", insets=0.0, text="Titel der Folie")
    + ph_sp(3, "Text", 'type="body" idx="1"', (0.6, 1.9, 12.13, 4.75), insets=0.05, text="Text")
    + ph_sp(4, "Fußzeile", 'type="ftr" sz="quarter" idx="11"', (0.6, 7.0, 10.0, 0.3), anchor="ctr", insets=0.0,
            lst=lvl(1, 9, MUTED))
    + ph_sp(5, "Foliennummer", 'type="sldNum" sz="quarter" idx="12"', (11.73, 7.0, 1.0, 0.3), anchor="ctr", insets=0.0,
            lst=lvl(1, 9, MUTED, algn="r"))
    + rect(6, "Trennlinie", (0.6, 1.55, 12.13, 0.0104), RULE)
    + '</p:spTree></p:cSld>' + CLRMAP
    + '<p:sldLayoutIdLst>' + ''.join(f'<p:sldLayoutId id="{2147483649 + n}" r:id="rId{n + 1}"/>' for n in range(N_LAYOUTS)) + '</p:sldLayoutIdLst>'
    + '<p:hf hdr="0" dt="0"/>'
    + '<p:txStyles>'
    + f'<p:titleStyle>{lvl(1, 26, INK, bold=True)}</p:titleStyle>'
    + '<p:bodyStyle>'
    + lvl(1, 18, INK, bullet=("•", PETROL), mar=0.3, indent=-0.3, before=8)
    + lvl(2, 16, INK, bullet=("–", MUTED), mar=0.65, indent=-0.28, before=4)
    + lvl(3, 14, MUTED, bullet=("–", MUTED), mar=1.0, indent=-0.25, before=2)
    + lvl(4, 14, MUTED, bullet=("–", MUTED), mar=1.3, indent=-0.25, before=2)
    + '</p:bodyStyle>'
    + f'<p:otherStyle>{lvl(1, 18, INK)}</p:otherStyle>'
    + '</p:txStyles></p:sldMaster>'
)

# ── Layouts ─────────────────────────────────────────────────────────────────
LAYOUTS = [
    # 1 Titelfolie: Petrol-Balken links, Logo + Wortmarke, großer Titel, Untertitel grau.
    ("Titelfolie", layout("Titelfolie", "title",
        rect(2, "Akzentbalken", (0, 0, 0.28, 7.5), PETROL)
        + picture(3, "Logo", "rId2", (0.75, 0.6, 0.55, 0.55))
        + textbox(4, "Wortmarke", (1.45, 0.66, 4.0, 0.42), "MindGraph Notes", 16, INK, bold=True)
        + ph_sp(5, "Titel", 'type="ctrTitle"', (0.75, 1.75, 11.8, 2.3), lst=lvl(1, 40, INK, bold=True), anchor="b", insets=0.0, text="Titel der Präsentation")
        + ph_sp(6, "Untertitel", 'type="subTitle" idx="1"', (0.75, 4.25, 11.8, 1.4), lst=lvl(1, 17, MUTED), anchor="t", insets=0.0, text="Untertitel · Anlass · Datum"),
        show_master=False), True),
    # 2 Titel und Inhalt
    ("Titel und Inhalt", layout("Titel und Inhalt", "obj",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + ph_sp(4, "Inhalt", 'idx="1"', text="Text") + footer(5)), False),
    # 3 Zwei Inhalte
    ("Zwei Inhalte", layout("Zwei Inhalte", "twoObj",
        kicker(2) + ph_sp(3, "Titel", 'type="title"')
        + ph_sp(4, "Inhalt links", 'sz="half" idx="1"', (0.6, 1.9, 5.92, 4.75), text="Text")
        + ph_sp(5, "Inhalt rechts", 'sz="half" idx="2"', (6.81, 1.9, 5.92, 4.75), text="Text")
        + footer(6)), False),
    # 4 Abschnitt: dunkler Grund wie die Schlussfolie des Pitches.
    ("Abschnitt", layout("Abschnitt", "secHead",
        kicker(2, color=TEAL_LIGHT, y=2.85)
        + ph_sp(3, "Titel", 'type="title"', (0.6, 3.2, 12.0, 1.15), lst=lvl(1, 34, "FFFFFF", bold=True), anchor="t", insets=0.0, text="Abschnitt")
        + ph_sp(4, "Text", 'type="body" idx="1"', (0.6, 4.2, 12.0, 1.2), lst=lvl(1, 16, ON_NAVY_MUTED), anchor="t", insets=0.0, text="Worum es in diesem Teil geht"),
        show_master=False, bg=NAVY), False),
    # 5 Nur Titel
    ("Nur Titel", layout("Nur Titel", "titleOnly",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + footer(4)), False),
    # 6 Bild mit Text: Text links, Bild rechts.
    ("Bild mit Text", layout("Bild mit Text", "picTx",
        kicker(2) + ph_sp(3, "Titel", 'type="title"')
        + ph_sp(4, "Bild", 'type="pic" idx="1"', (6.81, 1.9, 5.92, 4.75), text="")
        + ph_sp(5, "Text", 'type="body" sz="half" idx="2"', (0.6, 1.9, 5.92, 4.75),
                lst=lvl(1, 16, INK, bullet=("•", PETROL), mar=0.3, indent=-0.3, before=6), text="Text")
        + footer(6)), False),
    # 7 Abschluss: dunkel, heller Text — Vorschlag, nächste Schritte, Kontakt.
    ("Abschluss", layout("Abschluss", "cust",
        kicker(2, color=TEAL_LIGHT, y=0.5)
        + ph_sp(3, "Titel", 'type="title"', (0.6, 0.85, 12.1, 1.15), lst=lvl(1, 30, "FFFFFF", bold=True), anchor="t", insets=0.0, text="Nächste Schritte")
        + ph_sp(4, "Inhalt", 'idx="1"', (0.6, 2.2, 12.13, 4.4),
                lst=lvl(1, 16, ON_NAVY, bullet=("–", TEAL_LIGHT), mar=0.3, indent=-0.3, before=8)
                + lvl(2, 14, ON_NAVY_MUTED, bullet=("–", ON_NAVY_MUTED), mar=0.65, indent=-0.28, before=4), text="Text"),
        show_master=False, bg=NAVY), False),
    # 8 Drei Karten
    ("Drei Karten", layout("Drei Karten", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + cards(4, 3) + footer(8)), False),
    # 9 Vier Karten
    ("Vier Karten", layout("Vier Karten", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + cards(4, 4, gap=0.2) + footer(9)), False),
    # 10 Karten mit Kernaussage: drei kürzere Karten, darunter der dunkle Balken.
    ("Karten mit Kernaussage", layout("Karten mit Kernaussage", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + cards(4, 3, h=3.3) + banner(8) + footer(9)), False),
    # 11 Text mit Kernaussage
    ("Text mit Kernaussage", layout("Text mit Kernaussage", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + ph_sp(4, "Inhalt", 'idx="1"', (0.6, 1.9, 12.13, 3.35), text="Text")
        + banner(5) + footer(6)), False),
    # 12/13 Schritte: drei bzw. vier Karten mit Ziffernkästchen. Getrennte Layouts, weil die
    # Ziffern fest im Layout stehen — drei Schritte auf einem Vierer-Layout zeigten eine leere 4.
    ("Drei Schritte", layout("Drei Schritte", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + step_numbers(10, 3, h=3.2)
        + cards(4, 3, h=3.2, lst=STEP_LST, word="Schritt", fill=None) + footer(20)), False),
    ("Vier Schritte", layout("Vier Schritte", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + step_numbers(10, 4, h=3.2, gap=0.2)
        + cards(4, 4, h=3.2, lst=STEP_LST, word="Schritt", gap=0.2, fill=None) + footer(20)), False),
    # 13 Kennzahlen: drei große Zahlen.
    ("Kennzahlen", layout("Kennzahlen", "cust",
        kicker(2) + ph_sp(3, "Titel", 'type="title"') + cards(4, 3, y=2.1, h=2.7, lst=STAT_LST, word="Kennzahl", fill=PETROL_PALE)
        + footer(8)), False),
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
