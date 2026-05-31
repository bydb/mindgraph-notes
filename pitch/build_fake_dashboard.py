from pathlib import Path
from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "pitch" / "MindGraph-Dashboard-fiktive-daten.png"
LOGO = ROOT / "docs" / "icon.png"

W, H = 2048, 1152

FONT = "/System/Library/Fonts/Helvetica.ttc"


def f(size, bold=False):
    return ImageFont.truetype(FONT, size=size)


def rgb(value):
    value = value.strip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


BG = rgb("#faf8f0")
PANEL = rgb("#f5f0e4")
CARD = rgb("#fffdf8")
TEXT = rgb("#1a1a1a")
MID = rgb("#4a4540")
MUTED = rgb("#8a8278")
ACCENT = rgb("#c4764a")
ACCENT_LIGHT = rgb("#f4e2d7")
BORDER = rgb("#e6ded3")
GREEN_LIGHT = rgb("#eaf4ec")
RED_LIGHT = rgb("#f8ece8")


def rounded(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def paste_logo(img, x, y, size):
    logo = Image.open(LOGO).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    img.alpha_composite(logo, (x, y))


def text(draw, xy, s, size=18, fill=TEXT, bold=False, anchor=None):
    draw.text(xy, s, font=f(size, bold=bold), fill=fill, anchor=anchor)


def checkbox(draw, x, y, checked=False):
    draw.rounded_rectangle((x, y, x + 14, y + 14), radius=2, outline=(198, 190, 178), width=2, fill=BG)
    if checked:
        draw.line((x + 3, y + 7, x + 6, y + 11, x + 12, y + 3), fill=ACCENT, width=2)


def inbox_item(draw, y, initials, sender, subject, snippet, time, dot=None):
    draw.rectangle((1594, y, 2048, y + 62), fill=BG)
    draw.ellipse((1612, y + 16, 1646, y + 50), fill=ACCENT_LIGHT)
    text(draw, (1629, y + 27), initials, 13, ACCENT, bold=True, anchor="mm")
    text(draw, (1660, y + 12), sender, 13, TEXT, bold=True)
    text(draw, (1660, y + 31), subject, 13, MID, bold=True)
    text(draw, (1660, y + 49), snippet[:58], 11, MUTED)
    text(draw, (2002, y + 12), time, 10, MUTED, anchor="ra")
    if dot:
        draw.ellipse((2010, y + 31, 2018, y + 39), fill=dot)


def task_row(draw, x, y, title, note, date=None):
    checkbox(draw, x, y + 3)
    text(draw, (x + 24, y), title, 14, MID, bold=True)
    text(draw, (x + 24, y + 23), note, 11, MUTED)
    if date:
        text(draw, (x + 24, y + 42), date, 11, MUTED)


def build():
    img = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(img)

    # Top bar
    draw.rectangle((0, 0, W, 38), fill="#e9e5dc")
    rounded(draw, (10, 6, 34, 30), 6, CARD, BORDER)
    paste_logo(img, 48, 9, 22)
    text(draw, (78, 12), "MindGraph Notes", 14, MID, bold=True)
    rounded(draw, (208, 9, 242, 27), 5, ACCENT_LIGHT, None)
    text(draw, (225, 18), "BETA", 9, ACCENT, bold=True, anchor="mm")
    for i, label in enumerate(["Editor", "Split", "Graph", "Dashboard", "Workflow"]):
        x = 862 + i * 72
        fill = CARD if label != "Dashboard" else ACCENT_LIGHT
        rounded(draw, (x, 6, x + 66, 30), 6, fill, BORDER)
        text(draw, (x + 33, 18), label, 10, ACCENT if label == "Dashboard" else MUTED, bold=label == "Dashboard", anchor="mm")

    # Left sidebar
    draw.rectangle((0, 38, 286, H), fill="#f1eee6")
    draw.line((286, 38, 286, H), fill=BORDER, width=2)
    text(draw, (14, 58), "MINDGRAPH NOTES", 11, MUTED, bold=True)
    rounded(draw, (204, 48, 226, 70), 6, ACCENT_LIGHT)
    text(draw, (215, 59), "+", 16, ACCENT, bold=True, anchor="mm")
    text(draw, (12, 88), "2026", 15, MID, bold=True)
    text(draw, (12, 108), "2758 Notizen", 11, MUTED)
    for i, (c, n) in enumerate([(rgb("#df4a3f"), "13"), (rgb("#54a76b"), "21"), (rgb("#4c78c4"), "4")]):
        x = 12 + i * 48
        rounded(draw, (x, 136, x + 38, 155), 10, CARD, BORDER)
        draw.ellipse((x + 8, 142, x + 16, 150), fill=c)
        text(draw, (x + 26, 145), n, 10, MID, anchor="mm")

    folders = [
        ("010 - Notizen", "39"),
        ("211 - Journal", "13"),
        ("160 - Mars Abenteuer", "8"),
        ("143 - Digitaltag", "6"),
        ("180 - Vibe Coding", "13"),
        ("!!! - emails", "252"),
        ("Bücher", "0"),
        ("Artikel", "153"),
        ("100 - Projekte", "0"),
        ("200 - Bereich", "0"),
        ("300 - Ressourcen", "0"),
        ("800 - brain", "0"),
        ("28.05.26 - Journal", ""),
        ("Email-Instruktionen", ""),
    ]
    y = 184
    text(draw, (14, 170), "ANGEPPINNT", 10, MUTED, bold=True)
    for idx, (name, count) in enumerate(folders):
        if idx == 5:
            draw.line((0, y - 12, 286, y - 12), fill=BORDER)
        text(draw, (22, y), "›  📁  " + name, 12, MID)
        if count:
            rounded(draw, (244, y - 3, 268, y + 15), 9, CARD, BORDER)
            text(draw, (256, y + 6), count, 9, MUTED, anchor="mm")
        y += 31

    # Main dashboard
    draw.rectangle((286, 38, 1582, H), fill=BG)
    rounded(draw, (296, 46, 402, 68), 10, ACCENT_LIGHT)
    text(draw, (318, 52), "Dashboard", 12, ACCENT, bold=True)
    text(draw, (314, 98), "Dashboard", 22, TEXT, bold=True)
    text(draw, (314, 126), "Donnerstag, 28. Mai 2026", 13, MUTED)
    rounded(draw, (1530, 101, 1556, 127), 8, CARD, BORDER)
    text(draw, (1543, 114), "↻", 15, MUTED, anchor="mm")

    # Cards
    rounded(draw, (312, 170, 616, 338), 8, CARD, (224, 199, 179), 2)
    draw.rectangle((313, 171, 615, 212), fill="#f8efe7")
    text(draw, (326, 188), "HEUTE IM FOKUS", 10, ACCENT, bold=True)
    rounded(draw, (580, 182, 602, 204), 11, ACCENT_LIGHT, (224, 199, 179))
    text(draw, (591, 193), "1", 10, ACCENT, anchor="mm")
    text(draw, (326, 228), "1 Aufgabe heute fällig, 1 Mail wartet auf Antwort, 5", 13, TEXT, bold=True)
    text(draw, (326, 246), "Termine heute.", 13, TEXT, bold=True)
    draw.rectangle((312, 267, 316, 323), fill=ACCENT)
    text(draw, (334, 278), "Bei Fragen Anna Berger kontaktieren", 13, MID, bold=True)
    rounded(draw, (334, 306, 372, 323), 8, ACCENT_LIGHT)
    text(draw, (353, 314), "HEUTE", 8, ACCENT, bold=True, anchor="mm")
    text(draw, (382, 308), "Akkreditierungsformular für Fortbildungen", 10, MUTED)

    rounded(draw, (628, 170, 934, 1118), 8, CARD, BORDER, 2)
    draw.rectangle((629, 171, 933, 212), fill=RED_LIGHT)
    text(draw, (642, 188), "AUFGABEN", 10, MUTED, bold=True)
    rounded(draw, (892, 182, 918, 204), 11, RED_LIGHT, (228, 180, 170))
    text(draw, (905, 193), "22", 10, rgb("#d95d4c"), bold=True, anchor="mm")
    text(draw, (642, 229), "HEUTE", 10, MUTED, bold=True)
    task_row(draw, 642, 248, "Bei Fragen Anna Berger oder Tom Roth nachfragen", "Akkreditierungsformular für Fortbildungen · 00:00")
    text(draw, (642, 341), "BALD FÄLLIG", 10, MUTED, bold=True)
    fake_tasks = [
        ("Entwürfe prüfen und Rückmeldung geben", "AW: Digitaltag · 29.05."),
        ("Feedbackbogen ausfüllen", "Regionales Fachforum Medienbildung · 29.05."),
        ("Entscheidung zum Referat treffen", "Infos und Vorlagen für Referierende · 29.05."),
        ("Rückmeldung an Tom Roth geben", "Vorlagen für Referierende · 29.05."),
        ("Sammelmappe der Medienzentren befüllen", "Links zur Sammelmappe · 29.05."),
        ("Sammlung für Jahresbericht 2026 befüllen", "Links zur Jahresübersicht · 29.05."),
        ("Termin: Vertiefung KI-Chatbot", "Anfrage für einen Vertiefungstermin · 31.05."),
        ("Punktestände der Klassensieger melden", "Lesewettbewerb 2026 · 01.06."),
        ("Anmelden", "AW: Open educational resources · 01.06."),
    ]
    y = 360
    for title, note in fake_tasks:
        task_row(draw, 642, y, title, note)
        y += 60

    rounded(draw, (946, 170, 1248, 338), 8, CARD, BORDER, 2)
    draw.rectangle((947, 171, 1247, 212), fill=GREEN_LIGHT)
    text(draw, (960, 188), "ZU BEANTWORTEN", 10, MUTED, bold=True)
    rounded(draw, (1214, 182, 1236, 204), 11, GREEN_LIGHT, (172, 217, 190))
    text(draw, (1225, 193), "1", 10, rgb("#4d9f70"), bold=True, anchor="mm")
    draw.ellipse((960, 232, 968, 240), fill=ACCENT)
    text(draw, (980, 228), "Lilli Neumann", 13, TEXT, bold=True)
    text(draw, (980, 248), "AW: Digitaltag", 12, MID)

    # Right inbox
    draw.rectangle((1582, 38, W, H), fill="#f1eee6")
    draw.line((1582, 38, 1582, H), fill=BORDER, width=2)
    text(draw, (1602, 86), "Posteingang", 16, MID, bold=True)
    rounded(draw, (1912, 80, 1952, 104), 8, CARD, BORDER)
    text(draw, (1932, 92), "Neu", 11, MUTED, anchor="mm")
    rounded(draw, (1960, 80, 1994, 104), 8, CARD, BORDER)
    text(draw, (1977, 92), "KI", 11, MUTED, anchor="mm")
    rounded(draw, (1600, 114, 2040, 134), 5, "#e1ddd4", BORDER)
    text(draw, (1610, 120), "Inbox", 10, MUTED)
    rounded(draw, (1600, 146, 1970, 166), 5, CARD, BORDER)
    text(draw, (1610, 151), "Suchen...", 10, MUTED)
    rounded(draw, (1978, 146, 2038, 166), 5, CARD, BORDER)
    text(draw, (2008, 156), "Nur relevante", 10, MUTED, anchor="mm")
    items = [
        ("L", "Lilli Neumann", "AW: Digitaltag", "Hallo Herr Keller, im Anhang schicke ich Ihnen die Entwürfe ...", "14:26", ACCENT),
        ("V", "Veranstaltungen", "Regionales Fachforum Medienbildung", "Liebe Kolleginnen und Kollegen, vielen Dank für Ihre Teilnahme ...", "12:07", GREEN_LIGHT),
        ("T", "TinkerToys GmbH", "Konstruktions-Wettbewerb", "Vom 1. Juni bis 31. Juli Schulen einladen ...", "10:31", None),
        ("A", "Anna Berger", "Akkreditierungsformular für Fortbildungen", "Hallo Dominik, im Anhang findest du das Formular ...", "09:29", None),
        ("M", "Mara Sattler-Wolf", "Links zur Sammelmappe", "Guten Morgen zusammen, hier noch einmal die Links ...", "08:06", None),
        ("P", "Peter Baumann", "Lesewettbewerb 2026", "Sehr geehrte Schulleitungen, die Ergebnisse liegen bereit ...", "Gestern", None),
        ("I", "Ivy Liu", "Collaboration Opportunity", "Hi, can we book a meeting again next week? Thank you!", "Gestern", None),
        ("S", "Stefan Roth", "Re: User-Zugänge", "Hallo Frau Lang, vielen Dank für Ihre Nachricht ...", "Gestern", None),
        ("R", "Randi Becker", "Materialien für Digitaltag", "Die aktualisierten Dateien liegen im Ordner bereit ...", "Di", GREEN_LIGHT),
    ]
    y = 178
    for item in items:
        inbox_item(draw, y, *item)
        y += 62

    # Footer
    draw.rectangle((0, H - 27, W, H), fill="#e9e5dc")
    text(draw, (24, H - 19), "2026", 10, MUTED)
    text(draw, (78, H - 19), "2758 Notizen", 10, MUTED)
    text(draw, (180, H - 19), "4702 Links", 10, MUTED)
    text(draw, (360, H - 19), "329/463 · 134 offen", 10, MUTED)

    img.convert("RGB").save(OUT, quality=96)


if __name__ == "__main__":
    build()
