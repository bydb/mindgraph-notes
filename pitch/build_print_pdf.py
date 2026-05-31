from pathlib import Path
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import Paragraph
from PIL import Image, ImageEnhance


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "pitch" / "MindGraph-Notes-Infografik-Print-Vektor.pdf"
LOGO = ROOT / "docs" / "icon.png"
DASHBOARD = ROOT / "pitch" / "MindGraph-Dashboard-fiktive-daten.png"
QR = ROOT / "pitch" / "mindgraph-notes-download-qr.png"


def c(hex_value):
    hex_value = hex_value.strip("#")
    return colors.Color(
        int(hex_value[0:2], 16) / 255,
        int(hex_value[2:4], 16) / 255,
        int(hex_value[4:6], 16) / 255,
    )


BG = c("#faf8f0")
BG_WARM = c("#f5f0e4")
TEXT = c("#1a1a1a")
MID = c("#4a4540")
MUTED = c("#8a8278")
ACCENT = c("#c4764a")
ACCENT_LIGHT = c("#f1dfd3")
INK = c("#262136")
BORDER = c("#ded6ca")
CARD = colors.white
TELEGRAM = c("#229ED9")


def register_fonts():
    pdfmetrics.registerFont(TTFont("Georgia", "/System/Library/Fonts/Supplemental/Georgia.ttf"))
    pdfmetrics.registerFont(TTFont("Georgia-Bold", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"))
    pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
    pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))


def paragraph(canv, text, x, y, w, font="Arial", size=10, color=TEXT, leading=None):
    styles = getSampleStyleSheet()
    style = styles["Normal"]
    style.fontName = font
    style.fontSize = size
    style.leading = leading or size * 1.25
    style.textColor = color
    style.spaceAfter = 0
    p = Paragraph(text, style)
    _, h = p.wrap(w, 1000)
    p.drawOn(canv, x, y - h)
    return y - h


def pill(canv, x, y, w, h, label, fill=ACCENT_LIGHT, fg=ACCENT, size=10):
    canv.setFillColor(fill)
    canv.setStrokeColor(fill)
    canv.roundRect(x, y, w, h, h / 2, fill=1, stroke=0)
    canv.setFillColor(fg)
    canv.setFont("Arial-Bold", size)
    canv.drawCentredString(x + w / 2, y + h / 2 - size * 0.35, label)


def card(canv, x, y, w, h, r=4):
    canv.setFillColor(CARD)
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.6)
    canv.roundRect(x, y, w, h, r, fill=1, stroke=1)


def icon_circle(canv, x, y, label):
    canv.setFillColor(BG)
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(1.1)
    canv.circle(x, y, 6.2, fill=1, stroke=1)
    canv.setFillColor(ACCENT)
    canv.setFont("Arial-Bold", 7)
    canv.drawCentredString(x, y - 2.3, label)


def draw_flow_card(canv, x, y, w, h, title, subtitle, icon_label):
    card(canv, x, y, w, h, 5)
    icon_circle(canv, x + 13, y + h / 2, icon_label)
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 12)
    canv.drawString(x + 24, y + h - 16, title)
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 8.5)
    canv.drawString(x + 24, y + 9, subtitle)


def draw_telegram_badge(canv, x, y, w, h):
    card(canv, x, y, w, h, 5)
    cx, cy = x + 10 * mm, y + h / 2
    canv.setFillColor(TELEGRAM)
    canv.setStrokeColor(TELEGRAM)
    canv.circle(cx, cy, 6 * mm, fill=1, stroke=0)
    plane = canv.beginPath()
    plane.moveTo(cx - 3.2 * mm, cy)
    plane.lineTo(cx + 3.6 * mm, cy + 3.6 * mm)
    plane.lineTo(cx + 1.8 * mm, cy - 4.0 * mm)
    plane.lineTo(cx - 0.4 * mm, cy - 1.8 * mm)
    plane.lineTo(cx - 2.0 * mm, cy - 3.4 * mm)
    plane.lineTo(cx - 1.2 * mm, cy - 0.8 * mm)
    plane.close()
    canv.setFillColor(colors.white)
    canv.drawPath(plane, fill=1, stroke=0)
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 10.5)
    canv.drawString(x + 20 * mm, y + h - 7 * mm, "Telegram-Bot")
    canv.setFillColor(MID)
    canv.setFont("Arial", 7.3)
    canv.drawString(x + 20 * mm, y + 6.2 * mm, "fragt alle wichtigen Infos")
    canv.drawString(x + 20 * mm, y + 2.5 * mm, "für deinen Tag ab")


def draw_dashboard(canv, x, y, w, h):
    canv.saveState()
    # Vector miniature of the provided dashboard, rebuilt with fictional data for print sharpness.
    canv.setFillColor(colors.Color(0, 0, 0, alpha=0.06))
    canv.roundRect(x + 3, y - 4, w, h, 4, fill=1, stroke=0)
    canv.setFillColor(BG)
    canv.setStrokeColor(colors.black)
    canv.setLineWidth(0.7)
    canv.roundRect(x, y, w, h, 4, fill=1, stroke=1)

    top_h = 4.5 * mm
    side_w = 18 * mm
    inbox_w = 21 * mm
    canv.setFillColor(BG_WARM)
    canv.rect(x, y + h - top_h, w, top_h, fill=1, stroke=0)
    canv.rect(x, y, side_w, h - top_h, fill=1, stroke=0)
    canv.rect(x + w - inbox_w, y, inbox_w, h - top_h, fill=1, stroke=0)
    canv.setStrokeColor(BORDER)
    canv.setLineWidth(0.35)
    canv.line(x + side_w, y, x + side_w, y + h - top_h)
    canv.line(x + w - inbox_w, y, x + w - inbox_w, y + h - top_h)

    canv.drawImage(ImageReader(str(LOGO)), x + 2.2 * mm, y + h - 3.8 * mm, 2.5 * mm, 2.5 * mm, mask="auto")
    canv.setFillColor(MID)
    canv.setFont("Arial-Bold", 3.2)
    canv.drawString(x + 5.5 * mm, y + h - 3.1 * mm, "MindGraph Notes")

    canv.setFillColor(MUTED)
    canv.setFont("Arial", 3.2)
    canv.drawString(x + 2 * mm, y + h - top_h - 5 * mm, "2026")
    canv.drawString(x + 2 * mm, y + h - top_h - 8 * mm, "2758 Notizen")
    folder_y = y + h - top_h - 14 * mm
    for label, count in [
        ("010 - Notizen", "39"),
        ("143 - Digitaltag", "6"),
        ("!!! - emails", "252"),
        ("Artikel", "153"),
        ("Projekte", "0"),
        ("Ressourcen", "0"),
    ]:
        canv.setFillColor(MID)
        canv.setFont("Arial", 3.2)
        canv.drawString(x + 2 * mm, folder_y, label)
        canv.setFillColor(MUTED)
        canv.drawRightString(x + side_w - 2 * mm, folder_y, count)
        folder_y -= 5 * mm

    content_x = x + side_w + 4 * mm
    content_y = y + h - top_h - 8 * mm
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 6.5)
    canv.drawString(content_x, content_y, "Dashboard")
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 3.6)
    canv.drawString(content_x, content_y - 3.8 * mm, "Donnerstag, 28. Mai 2026")

    card_y = y + h - top_h - 27 * mm
    focus_w = 31 * mm
    task_w = 33 * mm
    answer_w = 28 * mm
    mini_gap = 3 * mm
    # Focus card
    canv.setFillColor(CARD)
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(0.45)
    canv.roundRect(content_x, card_y, focus_w, 19 * mm, 2, fill=1, stroke=1)
    canv.setFillColor(ACCENT_LIGHT)
    canv.rect(content_x, card_y + 14 * mm, focus_w, 5 * mm, fill=1, stroke=0)
    canv.setFillColor(ACCENT)
    canv.setFont("Arial-Bold", 3)
    canv.drawString(content_x + 2 * mm, card_y + 15.5 * mm, "HEUTE IM FOKUS")
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 3.6)
    canv.drawString(content_x + 2 * mm, card_y + 10.8 * mm, "1 Aufgabe, 1 Mail wartet")
    canv.drawString(content_x + 2 * mm, card_y + 7.2 * mm, "auf Antwort, 5 Termine")
    canv.setFillColor(MID)
    canv.setFont("Arial", 3.2)
    canv.drawString(content_x + 2 * mm, card_y + 3.5 * mm, "Anna Berger kontaktieren")

    # Task card
    tx = content_x + focus_w + mini_gap
    canv.setFillColor(CARD)
    canv.setStrokeColor(BORDER)
    canv.roundRect(tx, card_y - 23 * mm, task_w, 42 * mm, 2, fill=1, stroke=1)
    canv.setFillColor(colors.Color(0.97, 0.92, 0.90))
    canv.rect(tx, card_y + 14 * mm, task_w, 5 * mm, fill=1, stroke=0)
    canv.setFillColor(MUTED)
    canv.setFont("Arial-Bold", 3)
    canv.drawString(tx + 2 * mm, card_y + 15.5 * mm, "AUFGABEN")
    row_y = card_y + 10 * mm
    for title in ["Rückmeldung geben", "Feedbackbogen ausfüllen", "Referat entscheiden", "Sammelmappe befüllen", "Termin KI-Chatbot"]:
        canv.setStrokeColor(BORDER)
        canv.rect(tx + 2 * mm, row_y - 1.2 * mm, 2 * mm, 2 * mm, fill=0, stroke=1)
        canv.setFillColor(MID)
        canv.setFont("Arial", 3.2)
        canv.drawString(tx + 5.5 * mm, row_y - 0.8 * mm, title)
        row_y -= 6.4 * mm

    # Answer card
    ax = tx + task_w + mini_gap
    canv.setFillColor(CARD)
    canv.setStrokeColor(BORDER)
    canv.roundRect(ax, card_y, answer_w, 19 * mm, 2, fill=1, stroke=1)
    canv.setFillColor(colors.Color(0.90, 0.96, 0.92))
    canv.rect(ax, card_y + 14 * mm, answer_w, 5 * mm, fill=1, stroke=0)
    canv.setFillColor(MUTED)
    canv.setFont("Arial-Bold", 3)
    canv.drawString(ax + 2 * mm, card_y + 15.5 * mm, "ZU BEANTWORTEN")
    canv.setFillColor(ACCENT)
    canv.circle(ax + 3 * mm, card_y + 9.8 * mm, 0.8 * mm, fill=1, stroke=0)
    canv.setFillColor(MID)
    canv.setFont("Arial", 3.2)
    canv.drawString(ax + 5.5 * mm, card_y + 9 * mm, "Lilli Neumann")
    canv.drawString(ax + 5.5 * mm, card_y + 5.3 * mm, "AW: Digitaltag")

    # Inbox list
    inbox_x = x + w - inbox_w + 2 * mm
    canv.setFillColor(MID)
    canv.setFont("Arial-Bold", 4.3)
    canv.drawString(inbox_x, y + h - top_h - 7 * mm, "Posteingang")
    inbox_y = y + h - top_h - 14 * mm
    for initial, sender in [("L", "Lilli Neumann"), ("V", "Veranstaltungen"), ("T", "TinkerToys"), ("A", "Anna Berger"), ("M", "Mara Sattler"), ("P", "Peter Baumann")]:
        canv.setFillColor(ACCENT_LIGHT)
        canv.circle(inbox_x + 2 * mm, inbox_y, 2.2 * mm, fill=1, stroke=0)
        canv.setFillColor(ACCENT)
        canv.setFont("Arial-Bold", 3)
        canv.drawCentredString(inbox_x + 2 * mm, inbox_y - 1 * mm, initial)
        canv.setFillColor(MID)
        canv.setFont("Arial-Bold", 3.2)
        canv.drawString(inbox_x + 6 * mm, inbox_y + 0.8 * mm, sender)
        canv.setFillColor(MUTED)
        canv.setFont("Arial", 2.8)
        canv.drawString(inbox_x + 6 * mm, inbox_y - 2.5 * mm, "Fiktive Nachricht ...")
        inbox_y -= 6.5 * mm

    canv.setStrokeColor(colors.black)
    canv.setLineWidth(0.7)
    canv.roundRect(x, y, w, h, 4, fill=0, stroke=1)
    canv.restoreState()


def draw_header(canv, page_w, page_h, margin):
    canv.setFillColor(BG)
    canv.rect(0, 0, page_w, page_h, fill=1, stroke=0)

    # Decorative vector shapes.
    canv.setFillColor(ACCENT)
    p = canv.beginPath()
    p.moveTo(page_w - 28 * mm, page_h - 56 * mm)
    p.curveTo(page_w - 6 * mm, page_h - 60 * mm, page_w + 8 * mm, page_h - 50 * mm, page_w + 18 * mm, page_h - 42 * mm)
    p.lineTo(page_w + 18 * mm, page_h - 68 * mm)
    p.curveTo(page_w - 4 * mm, page_h - 70 * mm, page_w - 19 * mm, page_h - 64 * mm, page_w - 28 * mm, page_h - 56 * mm)
    p.close()
    canv.drawPath(p, fill=1, stroke=0)

    canv.drawImage(ImageReader(str(LOGO)), margin, page_h - margin - 11 * mm, 11 * mm, 11 * mm, mask="auto")
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 12)
    canv.drawString(margin + 15 * mm, page_h - margin - 4.2 * mm, "MindGraph Notes")
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 7.5)
    canv.drawString(margin + 15 * mm, page_h - margin - 9.3 * mm, "Open Source · Lokal · Kostenlos")
    pill(canv, page_w - margin - 62 * mm, page_h - margin - 8 * mm, 62 * mm, 8 * mm, "Lokal · DSGVO-konform · Open Source", size=8.2)

    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 31)
    canv.drawString(margin, page_h - 45 * mm, "Zeigt dir,")
    canv.setFillColor(ACCENT)
    canv.setFont("Georgia-Bold", 28)
    canv.drawString(margin, page_h - 58 * mm, "was heute wichtig ist.")
    canv.setFillColor(TEXT)
    canv.setFont("Arial-Bold", 13)
    canv.drawString(margin, page_h - 68 * mm, "DSGVO-konformes KI-Harness für den Mittelstand")

    paragraph(
        canv,
        "MindGraph Notes verbindet Notizen, Aufgaben, E-Mails und Dokumente - lokal, nachvollziehbar und ohne Cloud-Zwang.",
        page_w - margin - 74 * mm,
        page_h - 42 * mm,
        66 * mm,
        size=10,
        color=MID,
        leading=12.5,
    )


def build():
    register_fonts()
    canv = canvas.Canvas(str(OUT), pagesize=A4)
    page_w, page_h = A4
    margin = 13 * mm

    draw_header(canv, page_w, page_h, margin)

    # Main section.
    main_x, main_y = margin, 108 * mm
    main_w, main_h = page_w - 2 * margin, 126 * mm
    card(canv, main_x, main_y, main_w, main_h, 7)

    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 15)
    canv.drawString(main_x + 6 * mm, main_y + main_h - 14 * mm, "Vom verstreuten Büroalltag zu klaren Tagesüberblicken")
    canv.setFillColor(MUTED)
    canv.setFont("Arial", 10)
    canv.drawString(main_x + 6 * mm, main_y + main_h - 22 * mm, "Ein lokaler Workspace erkennt Kontext, Fristen und offene Antworten.")
    draw_telegram_badge(canv, main_x + 121 * mm, main_y + main_h - 34 * mm, 55 * mm, 17 * mm)

    draw_dashboard(canv, main_x + 6 * mm, main_y + 43 * mm, 92 * mm, 52 * mm)

    # Flow diagram with vector paths.
    cx, cy = main_x + 140 * mm, main_y + 65 * mm
    nodes = [
        (main_x + 101 * mm, main_y + 76 * mm, "Mail", "Antworten", "@"),
        (main_x + 151 * mm, main_y + 76 * mm, "Termine", "Kalender", "□"),
        (main_x + 101 * mm, main_y + 32 * mm, "Dokumente", "PDFs", "≡"),
        (main_x + 151 * mm, main_y + 32 * mm, "Aufgaben", "Fristen", "✓"),
        (main_x + 120 * mm, main_y + 13 * mm, "Notizen", "Kontext & Links", "•"),
    ]
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(1.3)
    for x, y, title, subtitle, label in nodes:
        canv.line(x + 18 * mm, y + 8 * mm, cx, cy)
    for x, y, title, subtitle, label in nodes:
        draw_flow_card(canv, x, y, 36 * mm if title != "Notizen" else 50 * mm, 15 * mm, title, subtitle, label)

    canv.setFillColor(INK)
    canv.setStrokeColor(ACCENT)
    canv.setLineWidth(2.2)
    canv.circle(cx, cy, 15 * mm, fill=1, stroke=1)
    canv.drawImage(ImageReader(str(LOGO)), cx - 5 * mm, cy + 1 * mm, 10 * mm, 10 * mm, mask="auto")
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 12)
    canv.drawCentredString(cx, cy - 8 * mm, "Überblick")

    pill(canv, main_x + 10 * mm, main_y + 6 * mm, 36 * mm, 8 * mm, "Was ist dringend?", size=8.2)
    pill(canv, main_x + 59 * mm, main_y + 6 * mm, 44 * mm, 8 * mm, "Was braucht Antwort?", size=8.2)
    pill(canv, main_x + 111 * mm, main_y + 6 * mm, 48 * mm, 8 * mm, "Was gehört zusammen?", size=8.2)

    # Problem cards.
    canv.setFillColor(TEXT)
    canv.setFont("Georgia-Bold", 20)
    canv.drawString(margin, 94 * mm, "Welche Probleme MindGraph Notes löst")
    problems = [
        ("01", "Information ist verstreut", "Mails, Kalender, Notizen und Aufgaben liegen getrennt. MindGraph Notes macht daraus Tagesüberblicke."),
        ("02", "Wichtiges geht unter", "Offene Antworten, Fristen und nächste Schritte werden sichtbar, bevor sie im Alltag verschwinden."),
        ("03", "DSGVO-konforme KI nutzen", "Lokale Modelle, keine Telemetrie, Open Source und optional E2E-verschlüsselter Sync."),
    ]
    box_w = (page_w - 2 * margin - 16 * mm) / 3
    for i, (num, title, body) in enumerate(problems):
        x = margin + i * (box_w + 8 * mm)
        y = 48 * mm
        card(canv, x, y, box_w, 38 * mm, 4)
        canv.setFillColor(ACCENT)
        canv.setFont("Arial", 8.5)
        canv.drawString(x + 4 * mm, y + 32 * mm, num)
        canv.setFillColor(TEXT)
        canv.setFont("Georgia-Bold", 13)
        paragraph(canv, title, x + 4 * mm, y + 27 * mm, box_w - 8 * mm, font="Georgia-Bold", size=13, color=TEXT, leading=15)
        paragraph(canv, body, x + 4 * mm, y + 16 * mm, box_w - 8 * mm, font="Arial", size=8.5, color=MID, leading=11)

    # CTA with QR.
    cta_y = 20 * mm
    canv.setFillColor(INK)
    canv.roundRect(margin, cta_y, page_w - 2 * margin, 19 * mm, 5, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Arial-Bold", 13.2)
    canv.drawString(margin + 5 * mm, cta_y + 12 * mm, "Sichere KI-Unterstützung für den Arbeitsalltag")
    canv.setFont("Arial", 9.2)
    canv.drawString(margin + 5 * mm, cta_y + 6.2 * mm, "Lokal. Ohne Cloud-Zwang. Für E-Mails, Termine, Aufgaben und Dokumente.")
    qr_size = 20 * mm
    canv.setFillColor(colors.white)
    canv.roundRect(page_w - margin - 57 * mm, cta_y - 1 * mm, 23 * mm, 23 * mm, 3, fill=1, stroke=0)
    canv.drawImage(ImageReader(str(QR)), page_w - margin - 55.5 * mm, cta_y + 0.5 * mm, qr_size, qr_size, mask="auto")
    canv.setFillColor(ACCENT)
    canv.roundRect(page_w - margin - 31 * mm, cta_y + 10 * mm, 26 * mm, 8 * mm, 4, fill=1, stroke=0)
    canv.setFillColor(colors.white)
    canv.setFont("Arial", 9)
    canv.drawCentredString(page_w - margin - 18 * mm, cta_y + 12.6 * mm, "Download")
    canv.setFont("Arial", 7.8)
    canv.drawString(page_w - margin - 31 * mm, cta_y + 5 * mm, "mindgraph-notes.de")

    canv.setFillColor(MUTED)
    canv.setFont("Arial", 7)
    canv.drawString(margin, 8 * mm, "https://mindgraph-notes.de/#download · bydb.io · github.com/bydb/mindgraph-notes")

    canv.setTitle("MindGraph Notes Infografik - Print Vektor")
    canv.showPage()
    canv.save()


if __name__ == "__main__":
    build()
