from pathlib import Path
import math
from PIL import Image, ImageDraw, ImageFont, ImageFilter


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "pitch"
PNG_OUT = OUT_DIR / "MindGraph-Notes-Infografik-Publikum.png"
PDF_OUT = OUT_DIR / "MindGraph-Notes-Infografik-Publikum.pdf"
LOGO = ROOT / "docs" / "icon.png"
SCREENSHOT = ROOT / "docs" / "screenshot.png"

W, H = 1240, 1754  # A4 at ~150 dpi
M = 72

FONT = "/System/Library/Fonts/Supplemental/Arial.ttf"
FONT_BOLD = "/System/Library/Fonts/Supplemental/Arial Bold.ttf"
FONT_BLACK = "/System/Library/Fonts/Supplemental/Arial Black.ttf"


def font(size, bold=False, black=False):
    path = FONT_BLACK if black else FONT_BOLD if bold else FONT
    return ImageFont.truetype(path, size=size)


def hex_to_rgb(value):
    value = value.strip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


INK = hex_to_rgb("#1f2933")
MUTED = hex_to_rgb("#65717f")
BRAND = hex_to_rgb("#241f35")
ORANGE = hex_to_rgb("#ff9500")
AMBER = hex_to_rgb("#f6b13d")
BLUE = hex_to_rgb("#1769aa")
TEAL = hex_to_rgb("#0f9184")
RED = hex_to_rgb("#c65a45")
GREEN = hex_to_rgb("#2a9d64")
CREAM = hex_to_rgb("#fbf7ed")
PAPER = hex_to_rgb("#fffdf8")
LINE = hex_to_rgb("#d8e1e8")


def rounded(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap_text(draw, text, fnt, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        trial = word if not current else current + " " + word
        if text_size(draw, trial, fnt)[0] <= max_width:
            current = trial
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def draw_text_block(draw, xy, text, fnt, fill=INK, max_width=400, line_gap=8, anchor=None):
    x, y = xy
    lines = wrap_text(draw, text, fnt, max_width)
    for line in lines:
        draw.text((x, y), line, font=fnt, fill=fill, anchor=anchor)
        y += fnt.size + line_gap
    return y


def pill(draw, xy, text, fill, fg, border=None):
    x1, y1, x2, y2 = xy
    rounded(draw, xy, 22, fill, border or fill, 2)
    tw, th = text_size(draw, text, font(20, bold=True))
    draw.text(((x1 + x2) / 2, (y1 + y2) / 2 - th / 2), text, font=font(20, bold=True), fill=fg, anchor="mm")


def paste_round(base, image, xy, size, radius):
    img = image.resize(size, Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", size, 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size[0], size[1]), radius=radius, fill=255)
    alpha = img.getchannel("A")
    alpha = Image.composite(alpha, Image.new("L", size, 0), mask)
    img.putalpha(alpha)
    base.alpha_composite(img, xy)


def arrow(draw, start, end, color, width=5):
    draw.line([start, end], fill=color, width=width)
    sx, sy = start
    ex, ey = end
    angle = math.atan2(ey - sy, ex - sx)
    size = 18
    points = [
        (ex, ey),
        (ex - size * math.cos(angle - 0.45), ey - size * math.sin(angle - 0.45)),
        (ex - size * math.cos(angle + 0.45), ey - size * math.sin(angle + 0.45)),
    ]
    draw.polygon(points, fill=color)


def source_node(draw, center, label, detail, color):
    cx, cy = center
    rounded(draw, (cx - 104, cy - 50, cx + 104, cy + 50), 28, (255, 255, 255), color, 3)
    draw.ellipse((cx - 84, cy - 35, cx - 44, cy + 5), fill=color)
    draw.text((cx - 20, cy - 28), label, font=font(22, bold=True), fill=INK)
    draw.text((cx - 20, cy + 2), detail, font=font(16), fill=MUTED)


def build():
    img = Image.new("RGBA", (W, H), PAPER + (255,))
    draw = ImageDraw.Draw(img)

    # Background accents
    draw.rectangle((0, 0, W, H), fill=CREAM)
    draw.ellipse((-210, -170, 420, 430), fill=(255, 236, 200, 255))
    draw.ellipse((890, 1220, 1480, 1880), fill=(224, 244, 241, 255))
    draw.rectangle((0, 0, W, 420), fill=BRAND)
    draw.polygon([(760, 0), (W, 0), (W, 420), (640, 420)], fill=(42, 36, 61))

    # Logo + brand
    logo = Image.open(LOGO).convert("RGBA")
    paste_round(img, logo, (M, 54), (118, 118), 59)
    draw.text((210, 70), "MindGraph Notes", font=font(38, bold=True), fill=(255, 255, 255))
    draw.text((212, 119), "Zeigt dir, was heute wichtig ist.", font=font(24), fill=(255, 200, 116))
    pill(draw, (890, 68, 1164, 116), "One-Pager für Teilnehmer", (255, 255, 255), BRAND)

    # Hero statement
    draw.text((M, 212), "Vom Info-Chaos", font=font(58, black=True), fill=(255, 255, 255))
    draw.text((M, 282), "zum Tagesblick.", font=font(58, black=True), fill=ORANGE)
    draw_text_block(
        draw,
        (760, 198),
        "Lokaler Arbeitsraum für E-Mails, Notizen, Aufgaben und Dokumente - mit KI, die auf dem eigenen Rechner arbeiten kann.",
        font(23),
        fill=(244, 245, 247),
        max_width=360,
        line_gap=10,
    )

    # Central infographic band
    band = (M, 480, W - M, 1035)
    rounded(draw, band, 40, (255, 255, 255), LINE, 2)
    draw.text((M + 34, 510), "So wird aus Streuung ein klarer Arbeitstag", font=font(30, bold=True), fill=INK)
    draw.text((M + 34, 552), "Daten bleiben lokal. Relevanz wird sichtbar. Follow-ups werden greifbar.", font=font(20), fill=MUTED)

    hub = (620, 750)
    sources = [
        ((265, 650), "Mail", "Antworten", BLUE),
        ((300, 865), "PDF", "Dokumente", RED),
        ((620, 940), "Tasks", "Fristen", GREEN),
        ((940, 865), "Notizen", "Kontext", TEAL),
        ((975, 650), "Termine", "Kalender", AMBER),
    ]
    for pos, label, detail, color in sources:
        arrow(draw, pos, hub, color, width=4)
        source_node(draw, pos, label, detail, color)

    # Hub
    shadow = Image.new("RGBA", (300, 300), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.ellipse((30, 30, 270, 270), fill=(0, 0, 0, 60))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    img.alpha_composite(shadow, (hub[0] - 150, hub[1] - 130))
    draw.ellipse((hub[0] - 118, hub[1] - 118, hub[0] + 118, hub[1] + 118), fill=BRAND, outline=ORANGE, width=6)
    small_logo = logo.resize((118, 118), Image.Resampling.LANCZOS)
    img.alpha_composite(small_logo, (hub[0] - 59, hub[1] - 78))
    draw.text((hub[0], hub[1] + 62), "Tagesblick", font=font(25, bold=True), fill=(255, 255, 255), anchor="mm")

    # Result chips
    results = [
        ((206, 993, 414, 1041), "Was ist dringend?", BLUE),
        ((476, 993, 764, 1041), "Was braucht Antwort?", ORANGE),
        ((826, 993, 1038, 1041), "Was gehört zusammen?", TEAL),
    ]
    for xy, label, color in results:
        rounded(draw, xy, 20, tuple(min(255, c + 225) for c in color), color, 2)
        draw.text(((xy[0] + xy[2]) / 2, (xy[1] + xy[3]) / 2), label, font=font(18, bold=True), fill=color, anchor="mm")

    # Benefit cards
    y = 1090
    draw.text((M, y), "Warum das fürs Büro zählt", font=font(34, black=True), fill=INK)
    cards = [
        (M, y + 62, 352, y + 328, BLUE, "01", "Morgens schneller entscheiden", "Briefing statt Suchen: Posteingang, Kalender und Projektordner werden zu einem Tagesblick."),
        (444, y + 62, 724, y + 328, TEAL, "02", "Wissen bleibt verbunden", "Projektakten, Meetings und Dokumente werden über Links und Canvas verständlich verknüpft."),
        (796, y + 62, W - M, y + 328, ORANGE, "03", "KI ohne Kontrollverlust", "Lokale Modelle, keine Telemetrie, Open Source und optional verschlüsselter Sync."),
    ]
    for x1, y1, x2, y2, color, num, title, body in cards:
        rounded(draw, (x1, y1, x2, y2), 26, (255, 255, 255), LINE, 2)
        draw.ellipse((x1 + 24, y1 + 24, x1 + 78, y1 + 78), fill=color)
        draw.text((x1 + 51, y1 + 51), num, font=font(20, bold=True), fill=(255, 255, 255), anchor="mm")
        draw_text_block(draw, (x1 + 24, y1 + 100), title, font(23, bold=True), fill=INK, max_width=x2 - x1 - 48, line_gap=5)
        draw_text_block(draw, (x1 + 24, y1 + 162), body, font(17), fill=MUTED, max_width=x2 - x1 - 48, line_gap=6)

    # Call to action
    cta = (M, 1464, W - M, 1648)
    rounded(draw, cta, 32, BRAND, None, 0)
    draw.text((M + 36, 1498), "Gesucht: 10 Test-User aus Mittelhessen", font=font(28, bold=True), fill=(255, 255, 255))
    draw_text_block(
        draw,
        (M + 36, 1543),
        "Ideal für Teams mit vielen Mails, Terminen und Projektinformationen - besonders, wenn sensible Daten nicht in irgendeine Cloud wandern sollen.",
        font(21),
        fill=(236, 238, 241),
        max_width=710,
        line_gap=8,
    )
    rounded(draw, (870, 1506, 1138, 1568), 24, ORANGE)
    draw.text((1004, 1537), "mindgraph-notes.de", font=font(24, bold=True), fill=BRAND, anchor="mm")
    rounded(draw, (870, 1588, 1138, 1640), 20, (255, 255, 255))
    draw.text((1004, 1614), "github.com/bydb/mindgraph-notes", font=font(14, bold=True), fill=BRAND, anchor="mm")

    draw.text((M, 1690), "Open Source | Lokale KI | E2E-Sync optional | Kontakt: Jochen Leeder / bydb.io", font=font(18), fill=MUTED)

    rgb = img.convert("RGB")
    rgb.save(PNG_OUT, quality=95)
    rgb.save(PDF_OUT, "PDF", resolution=150.0)


if __name__ == "__main__":
    build()
