from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import math


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "pitch"
PNG_OUT = OUT_DIR / "MindGraph-Notes-Infografik-CI.png"
PDF_OUT = OUT_DIR / "MindGraph-Notes-Infografik-CI.pdf"
LOGO = ROOT / "docs" / "icon.png"
SCREENSHOT = ROOT / "pitch" / "MindGraph-Dashboard-fiktive-daten.png"
QR_OUT = ROOT / "pitch" / "mindgraph-notes-download-qr.png"
DOWNLOAD_URL = "https://mindgraph-notes.de/#download"

W, H = 1240, 1754
M = 78

SANS = "/System/Library/Fonts/Helvetica.ttc"
SANS_BOLD = "/System/Library/Fonts/Helvetica.ttc"
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def f(size, bold=False, serif=False):
    path = SERIF_BOLD if serif and bold else SERIF if serif else SANS_BOLD if bold else SANS
    return ImageFont.truetype(path, size=size)


def rgb(hex_value):
    h = hex_value.strip("#")
    return tuple(int(h[i : i + 2], 16) for i in (0, 2, 4))


BG = rgb("#faf8f0")
BG_WARM = rgb("#f5f0e4")
CARD = rgb("#fffdf8")
TEXT = rgb("#1a1a1a")
MID = rgb("#4a4540")
MUTED = rgb("#8a8278")
ACCENT = rgb("#c4764a")
ACCENT_2 = rgb("#d4905e")
ACCENT_DARK = rgb("#b86a3e")
ACCENT_LIGHT = rgb("#f1dfd3")
INK = rgb("#262136")
BORDER = rgb("#e5dfd5")
GREEN = rgb("#22c55e")
TELEGRAM = rgb("#229ED9")


def rounded(draw, box, r, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=r, fill=fill, outline=outline, width=width)


def text_bbox(draw, text, font):
    b = draw.textbbox((0, 0), text, font=font)
    return b[2] - b[0], b[3] - b[1]


def wrap(draw, text, font, max_w):
    lines, line = [], ""
    for word in text.split():
        test = word if not line else f"{line} {word}"
        if text_bbox(draw, test, font)[0] <= max_w:
            line = test
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def text_block(draw, xy, text, font, fill=TEXT, max_w=400, gap=8):
    x, y = xy
    for line in wrap(draw, text, font, max_w):
        draw.text((x, y), line, font=font, fill=fill)
        y += font.size + gap
    return y


def paste_circle(base, image, center, diameter):
    img = image.resize((diameter, diameter), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (diameter, diameter), 0)
    d = ImageDraw.Draw(mask)
    d.ellipse((0, 0, diameter, diameter), fill=255)
    alpha = Image.composite(img.getchannel("A"), Image.new("L", (diameter, diameter), 0), mask)
    img.putalpha(alpha)
    base.alpha_composite(img, (center[0] - diameter // 2, center[1] - diameter // 2))


def grain_overlay(size):
    g = Image.new("RGBA", size, (0, 0, 0, 0))
    pix = g.load()
    for y in range(0, size[1], 3):
        for x in range(0, size[0], 3):
            v = ((x * 13 + y * 17) % 11)
            if v == 0:
                pix[x, y] = (0, 0, 0, 8)
    return g


def draw_pill(draw, x, y, text, fill, fg, pad_x=18):
    font = f(20, bold=True)
    tw, th = text_bbox(draw, text, font)
    box = (x, y, x + tw + pad_x * 2, y + 44)
    rounded(draw, box, 22, fill)
    draw.text((x + pad_x, y + 10), text, font=font, fill=fg)
    return box


def draw_telegram_badge(draw, x, y, w, h):
    rounded(draw, (x, y, x + w, y + h), 14, (255, 255, 255), BORDER, 2)
    draw.ellipse((x + 16, y + 15, x + 62, y + 61), fill=TELEGRAM)
    # Telegram-like paper plane, drawn as a simple white vector mark.
    plane = [
        (x + 27, y + 38),
        (x + 52, y + 25),
        (x + 46, y + 51),
        (x + 38, y + 43),
        (x + 33, y + 49),
        (x + 35, y + 41),
    ]
    draw.polygon(plane, fill=(255, 255, 255))
    draw.text((x + 76, y + 17), "Telegram-Bot", font=f(21, bold=True), fill=TEXT)
    draw.text((x + 76, y + 43), "fragt alle wichtigen Infos", font=f(15), fill=MID)
    draw.text((x + 76, y + 63), "für deinen Tag ab", font=f(15), fill=MID)


def draw_small_icon(draw, cx, cy, kind, color):
    draw.ellipse((cx - 22, cy - 22, cx + 22, cy + 22), fill=(250, 248, 240), outline=color, width=3)
    if kind == "mail":
        draw.rectangle((cx - 11, cy - 7, cx + 11, cy + 8), outline=color, width=3)
        draw.line((cx - 11, cy - 7, cx, cy + 2, cx + 11, cy - 7), fill=color, width=3)
    elif kind == "doc":
        draw.rectangle((cx - 9, cy - 13, cx + 9, cy + 13), outline=color, width=3)
        draw.line((cx - 5, cy - 2, cx + 6, cy - 2), fill=color, width=2)
        draw.line((cx - 5, cy + 5, cx + 6, cy + 5), fill=color, width=2)
    elif kind == "task":
        draw.rectangle((cx - 10, cy - 12, cx + 10, cy + 12), outline=color, width=3)
        draw.line((cx - 5, cy - 2, cx - 1, cy + 3, cx + 7, cy - 7), fill=color, width=3)
    elif kind == "cal":
        draw.rectangle((cx - 12, cy - 9, cx + 12, cy + 12), outline=color, width=3)
        draw.line((cx - 12, cy - 2, cx + 12, cy - 2), fill=color, width=2)
    else:
        draw.ellipse((cx - 5, cy - 5, cx + 5, cy + 5), fill=color)
        for a in (0, 2.1, 4.2):
            x = cx + int(math.cos(a) * 13)
            y = cy + int(math.sin(a) * 13)
            draw.line((cx, cy, x, y), fill=color, width=2)
            draw.ellipse((x - 4, y - 4, x + 4, y + 4), fill=color)


def draw_flow_card(draw, box, title, subtitle, kind):
    x1, y1, x2, y2 = box
    rounded(draw, box, 16, CARD, BORDER, 2)
    draw_small_icon(draw, x1 + 42, y1 + 44, kind, ACCENT)
    draw.text((x1 + 82, y1 + 24), title, font=f(25, bold=True), fill=TEXT)
    draw.text((x1 + 82, y1 + 58), subtitle, font=f(17), fill=MUTED)


def build():
    img = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(img)
    img.alpha_composite(grain_overlay((W, H)))

    # Website-like background glows, restrained and warm.
    draw.ellipse((880, -280, 1500, 380), fill=(196, 118, 74, 25))
    draw.ellipse((-310, 760, 270, 1380), fill=(196, 118, 74, 18))
    draw.rectangle((0, 0, W, 314), fill=BG)

    logo = Image.open(LOGO).convert("RGBA")

    # Header / brand.
    paste_circle(img, logo, (M + 38, 82), 64)
    draw.text((M + 88, 54), "MindGraph Notes", font=f(26, bold=True), fill=TEXT)
    draw.text((M + 88, 88), "Open Source · Lokal · Kostenlos", font=f(15), fill=MUTED)
    draw_pill(draw, W - M - 292, 54, "Lokal · DSGVO-konform · Open Source", ACCENT_LIGHT, ACCENT_DARK)

    # Hero mirrors website language and display serif.
    draw.text((M, 154), "Zeigt dir,", font=f(65, serif=True), fill=TEXT)
    draw.text((M, 226), "was heute wichtig ist.", font=f(65, serif=True), fill=ACCENT)
    draw.text((M, 312), "DSGVO-konformes KI-Harness für den Mittelstand", font=f(28, bold=True), fill=TEXT)
    text_block(
        draw,
        (710, 158),
        "MindGraph Notes verbindet Notizen, Aufgaben, E-Mails und Dokumente - lokal, nachvollziehbar und ohne Cloud-Zwang.",
        f(23),
        fill=MID,
        max_w=430,
        gap=10,
    )

    # Main infographic card.
    main = (M, 360, W - M, 1112)
    rounded(draw, main, 20, (255, 255, 255), BORDER, 2)
    draw.text((M + 36, 398), "Vom verstreuten Büroalltag zu klaren Tagesüberblicken", font=f(32, serif=True), fill=TEXT)
    draw.text((M + 36, 446), "Ein lokaler Workspace erkennt Kontext, Fristen und offene Antworten.", font=f(20), fill=MUTED)

    # Real app screenshot, styled like website hero screenshot.
    shot = Image.open(SCREENSHOT).convert("RGB")
    sw, sh = shot.size
    crop = shot.crop((0, 0, sw, int(sh * 0.72)))
    preview_w, preview_h = 520, 326
    preview = crop.resize((preview_w, preview_h), Image.Resampling.LANCZOS).convert("RGBA")
    shadow = Image.new("RGBA", (preview_w + 80, preview_h + 80), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((40, 40, preview_w + 40, preview_h + 40), 16, fill=(0, 0, 0, 48))
    shadow = shadow.filter(ImageFilter.GaussianBlur(22))
    img.alpha_composite(shadow, (M + 12, 500))
    mask = Image.new("L", (preview_w, preview_h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle((0, 0, preview_w, preview_h), 14, fill=255)
    framed = Image.new("RGBA", (preview_w, preview_h), (0, 0, 0, 0))
    framed.alpha_composite(preview)
    framed.putalpha(mask)
    img.alpha_composite(framed, (M + 36, 526))
    draw.rounded_rectangle((M + 36, 526, M + 36 + preview_w, 526 + preview_h), 14, outline=(0, 0, 0, 28), width=2)

    # Flow diagram.
    cx, cy = 905, 720
    inputs = [
        ((650, 558, 860, 650), "Mail", "Antworten", "mail"),
        ((936, 558, 1146, 650), "Termine", "Kalender", "cal"),
        ((650, 824, 860, 916), "Dokumente", "PDFs", "doc"),
        ((936, 824, 1146, 916), "Aufgaben", "Fristen", "task"),
        ((760, 938, 1050, 1020), "Notizen", "Kontext & Links", "graph"),
    ]
    for box, title, subtitle, kind in inputs:
        bx = (box[0] + box[2]) // 2
        by = (box[1] + box[3]) // 2
        draw.line((bx, by, cx, cy), fill=(196, 118, 74, 145), width=4)
    for box, title, subtitle, kind in inputs:
        draw_flow_card(draw, box, title, subtitle, kind)

    # Redraw hub last so the real logo stays clean.
    draw.ellipse((cx - 84, cy - 84, cx + 84, cy + 84), fill=INK, outline=ACCENT, width=5)
    paste_circle(img, logo, (cx, cy - 20), 62)
    draw.text((cx, cy + 50), "Überblick", font=f(23, bold=True), fill=(255, 255, 255), anchor="mm")

    # Outcome pills.
    outcomes = [
        (M + 54, 1038, "Was ist dringend?"),
        (M + 318, 1038, "Was braucht Antwort?"),
        (M + 632, 1038, "Was gehört zusammen?"),
    ]
    for x, y, label in outcomes:
        draw_pill(draw, x, y, label, ACCENT_LIGHT, ACCENT_DARK, pad_x=18)

    draw_telegram_badge(draw, M + 670, 466, 360, 82)

    # Benefits.
    draw.text((M, 1166), "Welche Probleme MindGraph Notes löst", font=f(38, serif=True), fill=TEXT)
    benefits = [
        ("01", "Information ist verstreut", "Mails, Kalender, Notizen und Aufgaben liegen getrennt. MindGraph Notes macht daraus Tagesüberblicke."),
        ("02", "Wichtiges geht unter", "Offene Antworten, Fristen und nächste Schritte werden sichtbar, bevor sie im Alltag verschwinden."),
        ("03", "DSGVO-konforme KI nutzen", "Lokale Modelle, keine Telemetrie, Open Source und optional E2E-verschlüsselter Sync."),
    ]
    card_w, gap = 332, 44
    for i, (num, title, body) in enumerate(benefits):
        x = M + i * (card_w + gap)
        y = 1234
        rounded(draw, (x, y, x + card_w, y + 270), 16, (255, 255, 255, 208), BORDER, 2)
        draw.text((x + 24, y + 25), num, font=f(18, bold=True), fill=ACCENT)
        text_block(draw, (x + 24, y + 64), title, f(25, serif=True), fill=TEXT, max_w=card_w - 48, gap=7)
        text_block(draw, (x + 24, y + 138), body, f(17), fill=MID, max_w=card_w - 48, gap=6)

    # CTA band, website button language.
    cta = (M, 1550, W - M, 1664)
    rounded(draw, cta, 18, INK)
    draw.text((M + 30, 1566), "Sichere KI-Unterstützung für den Arbeitsalltag", font=f(30, bold=True), fill=(255, 255, 255))
    draw.text((M + 30, 1608), "Lokal. Ohne Cloud-Zwang. Für E-Mails, Termine, Aufgaben und Dokumente.", font=f(18), fill=(234, 229, 222))
    qr = Image.open(QR_OUT).convert("RGBA").resize((92, 92), Image.Resampling.NEAREST)
    rounded(draw, (W - M - 332, 1561, W - M - 220, 1673), 12, (255, 253, 248), None)
    img.alpha_composite(qr, (W - M - 322, 1571))
    draw_pill(draw, W - M - 206, 1574, "Download", ACCENT, (255, 255, 255), pad_x=22)
    draw.text((W - M - 200, 1626), "mindgraph-notes.de", font=f(15), fill=(234, 229, 222))
    draw.text((M, 1700), f"{DOWNLOAD_URL} · bydb.io · github.com/bydb/mindgraph-notes", font=f(15), fill=MUTED)

    rgb_img = img.convert("RGB")
    rgb_img.save(PNG_OUT, quality=96)
    rgb_img.save(PDF_OUT, "PDF", resolution=150.0)


if __name__ == "__main__":
    build()
