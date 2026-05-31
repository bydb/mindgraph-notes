from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "pitch" / "MindGraph-Notes-Onepager-Print-V2.pdf"
LOGO = ROOT / "docs" / "icon.png"
QR = ROOT / "pitch" / "mindgraph-notes-download-qr.png"


def c(hex_value):
    h = hex_value.strip("#")
    return colors.Color(int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255)


BG = c("#faf8f0")
BG_WARM = c("#f5f0e4")
TEXT = c("#1a1a1a")
MID = c("#4a4540")
MUTED = c("#8a8278")
ACCENT = c("#c4764a")
ACCENT_LIGHT = c("#f1dfd3")
INK = c("#262136")
BORDER = c("#ded6ca")
TELEGRAM = c("#229ED9")
GREEN = c("#22a06b")
CARD = colors.white


def register_fonts():
    pdfmetrics.registerFont(TTFont("Georgia", "/System/Library/Fonts/Supplemental/Georgia.ttf"))
    pdfmetrics.registerFont(TTFont("Georgia-Bold", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))


def para(canv, text, x, y, w, font="Arial", size=10, color=TEXT, leading=None):
    style = getSampleStyleSheet()["Normal"]
    style.fontName = font
    style.fontSize = size
    style.leading = leading or size * 1.25
    style.textColor = color
    style.spaceAfter = 0
    p = Paragraph(text, style)
    _, h = p.wrap(w, 500)
    p.drawOn(canv, x, y - h)
    return y - h


def pill(canv, x, y, w, h, label, fill=ACCENT_LIGHT, fg=ACCENT, size=8.5):
    canv.setFillColor(fill)
    canv.setStrokeColor(fill)
    canv.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    canv.setFillColor(fg)
    canv.setFont("Arial-Bold", size)
    canv.drawCentredString(x + w / 2, y + h / 2 - size * 0.35, label)


def card(canv, x, y, w, h, r=5, fill=CARD):
    canv.setFillColor(fill)
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.6)
    canv.roundRect(x, y, w, h, r, fill=1, stroke=1)


def draw_paper_plane(canv, cx, cy, scale=1.0):
    p = canv.beginPath()
    p.moveTo(cx - 3.5 * mm * scale, cy)
    p.lineTo(cx + 4.2 * mm * scale, cy + 4.0 * mm * scale)
    p.lineTo(cx + 2.1 * mm * scale, cy - 4.4 * mm * scale)
    p.lineTo(cx - 0.4 * mm * scale, cy - 1.9 * mm * scale)
    p.lineTo(cx - 2.0 * mm * scale, cy - 3.5 * mm * scale)
    p.lineTo(cx - 1.2 * mm * scale, cy - 0.8 * mm * scale)
    p.close()
    canv.drawPath(p, fill=1, stroke=0)


def draw_source(canv, x, y, label, detail, mark):
    card(canv, x, y, 35 * mm, 18 * mm, 5)
    canv.setFillColor(ACCENT_LIGHT)
    canv.circle(x + 8 * mm, y + 9 * mm, 5 * mm, fill=1, stroke=0)
    canv.setFillColor(ACCENT)
    canv.setFont("Arial-Bold", 8)
    canv.drawCentredString(x + 8 * mm, y + 6.5 * mm, mark)
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 10)
    canv.drawString(x + 16 * mm, y + 10.5 * mm, label)
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 7.5)
    canv.drawString(x + 16 * mm, y + 5 * mm, detail)


def draw_result(canv, x, y, w, h, title, body, mode):
    card(canv, x, y, w, h, 6)
    if mode == "telegram":
        canv.setFillColor(TELEGRAM)
        canv.circle(x + 9 * mm, y + h / 2, 5.4 * mm, fill=1, stroke=0)
        canv.setFillColor(colors.white)
        draw_paper_plane(canv, x + 9 * mm, y + h / 2, 0.62)
    else:
        canv.drawImage(ImageReader(str(LOGO)), x + 3.6 * mm, y + h / 2 - 5.4 * mm, 10.8 * mm, 10.8 * mm, mask="auto")
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 9.2)
    canv.drawString(x + 17 * mm, y + h - 7.2 * mm, title)
    para(canv, body, x + 17 * mm, y + h - 12 * mm, w - 20 * mm, size=6.8, color=MID, leading=7.7)


def arrow(canv, x1, y1, x2, y2, color=ACCENT, width=1.1):
    canv.setStrokeColor(color)
    canv.setFillColor(color)
    canv.setLineWidth(width)
    canv.line(x1, y1, x2, y2)
    size = 2.4 * mm
    canv.line(x2, y2, x2 - size, y2 + size / 2)
    canv.line(x2, y2, x2 - size, y2 - size / 2)


def build():
    register_fonts()
    canv = canvas.Canvas(str(OUT), pagesize=A4)
    page_w, page_h = A4
    margin = 13 * mm

    canv.setFillColor(BG)
    canv.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Header
    canv.drawImage(ImageReader(str(LOGO)), margin, page_h - margin - 11 * mm, 11 * mm, 11 * mm, mask="auto")
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 12)
    canv.drawString(margin + 15 * mm, page_h - margin - 4.2 * mm, "MindGraph Notes")
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 7.4)
    canv.drawString(margin + 15 * mm, page_h - margin - 9.3 * mm, "Open Source · Lokal · Kostenlos")
    pill(canv, page_w - margin - 58 * mm, page_h - margin - 8 * mm, 58 * mm, 8 * mm, "Lokal · DSGVO-konform", size=8.2)

    # Hero
    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 27)
    canv.drawString(margin, page_h - 43 * mm, "DSGVO-konformes")
    canv.setFillColor(ACCENT)
    canv.setFont("Georgia-Bold", 31)
    canv.drawString(margin, page_h - 57 * mm, "KI-Harness")
    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 27)
    canv.drawString(margin, page_h - 70 * mm, "für den Mittelstand")
    para(
        canv,
        "MindGraph Notes verbindet E-Mails, Termine, Aufgaben, Notizen und Dokumente zu klaren Tagesüberblicken. Lokal. Ohne Cloud-Zwang. Für Teams, die KI nutzen wollen, ohne die Kontrolle über ihre Daten zu verlieren.",
        page_w - margin - 78 * mm,
        page_h - 43 * mm,
        78 * mm,
        size=11.2,
        color=MID,
        leading=14,
    )

    # Problem strip
    strip_y = page_h - 96 * mm
    canv.setFillColor(INK)
    canv.roundRect(margin, strip_y, page_w - 2 * margin, 20 * mm, 6, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 13)
    canv.drawString(margin + 6 * mm, strip_y + 12 * mm, "Das Problem:")
    canv.setFont("Arial", 10)
    canv.drawString(margin + 36 * mm, strip_y + 12 * mm, "Wichtige Arbeitssignale liegen verstreut.")
    canv.drawString(margin + 36 * mm, strip_y + 6 * mm, "Offene Antworten, Fristen und Zusammenhänge gehen im Alltag unter.")

    # Flow section
    flow_y = page_h - 191 * mm
    flow_h = 84 * mm
    card(canv, margin, flow_y, page_w - 2 * margin, flow_h, 7)
    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 16)
    canv.drawString(margin + 6 * mm, flow_y + flow_h - 13 * mm, "Aus verstreuten Quellen werden Tagesüberblicke")

    sources = [
        (margin + 8 * mm, flow_y + 48 * mm, "Mail", "Antworten", "@"),
        (margin + 8 * mm, flow_y + 27 * mm, "Termine", "Kalender", "□"),
        (margin + 8 * mm, flow_y + 6 * mm, "Notizen", "Kontext", "•"),
        (margin + 46 * mm, flow_y + 48 * mm, "Aufgaben", "Fristen", "✓"),
        (margin + 46 * mm, flow_y + 27 * mm, "Dokumente", "PDFs", "≡"),
    ]
    for item in sources:
        draw_source(canv, *item)

    hub_x, hub_y = margin + 111 * mm, flow_y + 43 * mm
    arrow(canv, margin + 87 * mm, hub_y, hub_x - 18 * mm, hub_y)

    canv.setFillColor(INK)
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(2)
    canv.circle(hub_x, hub_y, 16 * mm, fill=1, stroke=1)
    canv.drawImage(ImageReader(str(LOGO)), hub_x - 5.2 * mm, hub_y + 1.8 * mm, 10.4 * mm, 10.4 * mm, mask="auto")
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 11)
    canv.drawCentredString(hub_x, hub_y - 7.5 * mm, "Überblick")

    out_x = margin + 142 * mm
    arrow(canv, hub_x + 16 * mm, hub_y, out_x - 5 * mm, hub_y)
    draw_result(
        canv,
        out_x,
        flow_y + 47 * mm,
        39 * mm,
        17.5 * mm,
        "App",
        "Dashboard für Aufgaben, Mails und Fristen.",
        "app",
    )
    draw_result(
        canv,
        out_x,
        flow_y + 23 * mm,
        39 * mm,
        17.5 * mm,
        "Telegram",
        "fragt Tagesinfos per Chat ab.",
        "telegram",
    )

    # Benefits
    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 20)
    canv.drawString(margin, 84 * mm, "Was der Mittelstand konkret gewinnt")
    benefits = [
        ("01", "Weniger Suchen", "E-Mails, Termine, Aufgaben und Dokumente landen in einem Arbeitskontext."),
        ("02", "Weniger Vergessen", "Offene Antworten, Fristen und nächste Schritte werden sichtbar."),
        ("03", "KI mit Kontrolle", "Lokale Modelle, keine Telemetrie und optional E2E-verschlüsselter Sync."),
    ]
    box_w = (page_w - 2 * margin - 16 * mm) / 3
    for i, (num, title, body) in enumerate(benefits):
        x = margin + i * (box_w + 8 * mm)
        y = 45 * mm
        card(canv, x, y, box_w, 31 * mm, 4)
        canv.setFillColor(ACCENT)
        canv.setFont("Arial", 8)
        canv.drawString(x + 4 * mm, y + 25 * mm, num)
        canv.setFillColor(TEXT)
        canv.setFont("Georgia-Bold", 13)
        para(canv, title, x + 4 * mm, y + 21 * mm, box_w - 8 * mm, font="Georgia-Bold", size=13, color=TEXT, leading=15)
        para(canv, body, x + 4 * mm, y + 11 * mm, box_w - 8 * mm, font="Arial", size=8.6, color=MID, leading=10.5)

    # CTA
    cta_y = 19 * mm
    canv.setFillColor(INK)
    canv.roundRect(margin, cta_y, page_w - 2 * margin, 18 * mm, 5, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 13.5)
    canv.drawString(margin + 5 * mm, cta_y + 11.5 * mm, "Jetzt testen: MindGraph Notes")
    canv.setFont("Arial", 8.8)
    canv.drawString(margin + 5 * mm, cta_y + 5.8 * mm, "DSGVO-konforme KI-Unterstützung für den Arbeitsalltag.")
    canv.setFillColor(colors.white)
    canv.roundRect(page_w - margin - 57 * mm, cta_y - 1 * mm, 23 * mm, 23 * mm, 3, fill=1, stroke=0)
    canv.drawImage(ImageReader(str(QR)), page_w - margin - 55.5 * mm, cta_y + 0.5 * mm, 20 * mm, 20 * mm, mask="auto")
    canv.setFillColor(ACCENT)
    canv.roundRect(page_w - margin - 31 * mm, cta_y + 9.8 * mm, 26 * mm, 8 * mm, 4, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Arial", 9)
    canv.drawCentredString(page_w - margin - 18 * mm, cta_y + 12.4 * mm, "Download")
    canv.setFont("Arial", 7.8)
    canv.drawString(page_w - margin - 31 * mm, cta_y + 4.8 * mm, "mindgraph-notes.de")

    canv.setFillColor(MUTED)
    canv.setFont("Arial", 7)
    canv.drawString(margin, 8 * mm, "https://mindgraph-notes.de/#download · bydb.io · github.com/bydb/mindgraph-notes")
    canv.setTitle("MindGraph Notes Onepager Print V2")
    canv.showPage()
    canv.save()


if __name__ == "__main__":
    build()
