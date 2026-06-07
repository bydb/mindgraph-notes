from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter, JpegImagePlugin

_ = JpegImagePlugin


ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "pitch"
PNG_OUT = OUT_DIR / "MindGraph-Notes-Modellqualitaet.png"
PDF_OUT = OUT_DIR / "MindGraph-Notes-Modellqualitaet.pdf"
LOGO = ROOT / "docs" / "icon.png"

W, H = 1600, 2400
M = 88

SANS = "/System/Library/Fonts/Helvetica.ttc"
SANS_BOLD = "/System/Library/Fonts/Helvetica.ttc"
SERIF = "/System/Library/Fonts/Supplemental/Georgia.ttf"
SERIF_BOLD = "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"


def font(size, bold=False, serif=False):
    path = SERIF_BOLD if serif and bold else SERIF if serif else SANS_BOLD if bold else SANS
    return ImageFont.truetype(path, size=size)


def rgb(value):
    value = value.strip("#")
    return tuple(int(value[i : i + 2], 16) for i in (0, 2, 4))


BG = rgb("#f7f4ec")
PAPER = rgb("#fffdf8")
INK = rgb("#171717")
TEXT = rgb("#28231f")
MUTED = rgb("#706a62")
BORDER = rgb("#ddd5c8")
BRAND = rgb("#252036")
ORANGE = rgb("#c87647")
ORANGE_LIGHT = rgb("#f1dfd2")
GREEN = rgb("#1f9d58")
GREEN_LIGHT = rgb("#dff3e7")
YELLOW = rgb("#c69224")
YELLOW_LIGHT = rgb("#fbefc9")
RED = rgb("#bd433c")
RED_LIGHT = rgb("#f8dedb")
BLUE = rgb("#266aa6")
BLUE_LIGHT = rgb("#dcebf6")
GRAY_LIGHT = rgb("#f1eee7")


MODULES = [
    ("brain", "Brain"),
    ("task-extraction", "Tasks"),
    ("mail-summary", "Mail"),
    ("dashboard-snapshot", "Radar"),
    ("project-status", "Projekt"),
    ("smart-connections", "Links"),
]

MODELS = [
    {
        "id": "qwen3.5:4b",
        "label": "Qwen 3.5 4B",
        "ram": "3,4 GB",
        "note": "kleine Macs, Mail + Projekt",
        "verdicts": {
            "brain": "untested",
            "task-extraction": "green",
            "mail-summary": "green",
            "dashboard-snapshot": "untested",
            "project-status": "yellow",
            "smart-connections": "na",
        },
    },
    {
        "id": "ministral-3:8b",
        "label": "Ministral 3 8B",
        "ram": "6 GB",
        "note": "Brain/Radar Default",
        "verdicts": {
            "brain": "green",
            "task-extraction": "yellow",
            "mail-summary": "green",
            "dashboard-snapshot": "green",
            "project-status": "yellow",
            "smart-connections": "na",
        },
    },
    {
        "id": "gemma4:latest",
        "label": "Gemma 4",
        "ram": "10 GB",
        "note": "schnell, prompt-sensibel",
        "verdicts": {
            "brain": "green",
            "task-extraction": "yellow",
            "mail-summary": "green",
            "dashboard-snapshot": "green",
            "project-status": "untested",
            "smart-connections": "na",
        },
    },
    {
        "id": "gemma4:12b-mlx",
        "label": "Gemma 4 12B MLX",
        "ram": "10-11 GB",
        "note": "Apple Silicon, Tasks stark",
        "verdicts": {
            "brain": "yellow",
            "task-extraction": "green",
            "mail-summary": "green",
            "dashboard-snapshot": "green",
            "project-status": "green",
            "smart-connections": "na",
        },
    },
    {
        "id": "qwen3.6:27b-mlx",
        "label": "Qwen 3.6 27B MLX",
        "ram": "19-22 GB",
        "note": "Qualität, mehr RAM",
        "verdicts": {
            "brain": "green",
            "task-extraction": "green",
            "mail-summary": "yellow",
            "dashboard-snapshot": "green",
            "project-status": "green",
            "smart-connections": "na",
        },
    },
    {
        "id": "qwen3.6:latest",
        "label": "Qwen 3.6",
        "ram": "48 GB",
        "note": "sehr stark, schwer",
        "verdicts": {
            "brain": "green",
            "task-extraction": "green",
            "mail-summary": "green",
            "dashboard-snapshot": "green",
            "project-status": "green",
            "smart-connections": "na",
        },
    },
    {
        "id": "llama3.1:8b",
        "label": "Llama 3.1 8B",
        "ram": "8 GB",
        "note": "Warnmodell im Radar",
        "verdicts": {
            "brain": "red",
            "task-extraction": "yellow",
            "mail-summary": "green",
            "dashboard-snapshot": "red",
            "project-status": "untested",
            "smart-connections": "na",
        },
    },
    {
        "id": "bge-m3:latest",
        "label": "bge-m3",
        "ram": "0,6 GB",
        "note": "Embedding für Links",
        "verdicts": {
            "brain": "na",
            "task-extraction": "na",
            "mail-summary": "na",
            "dashboard-snapshot": "na",
            "project-status": "na",
            "smart-connections": "green",
        },
    },
]

DEFAULTS = {
    "brain": "ministral-3:8b",
    "task-extraction": "qwen3.5:4b",
    "mail-summary": "qwen3.5:4b",
    "dashboard-snapshot": "ministral-3:8b",
    "project-status": "qwen3.5:4b",
    "smart-connections": "bge-m3:latest",
}

EVIDENCE = [
    ("Task-Extraktion", "10 Mail-Fälle, Two-Pass-Datumsauflösung, for_whom und Reply-Erkennung"),
    ("Mail-Zusammenfassung", "8 Mail-Fälle, JSON, Sentiment, Relevanz, needsReply, Halluzinationsrate"),
    ("Dashboard-Radar", "8 Notiz-Fälle inkl. Prompt-Injection; schadensrelevanter Hard-Lock-Pfad"),
    ("Brain", "4 Tages-Szenarien, Wikilinks, Halluzinationen, Bewertungs- und Regel-5-Checks"),
    ("Projekt-Status", "2 Projekt-Cases x Wiederholungen, Honesty-Scorer, Draft-Review statt Auto-Write"),
]

HIGHLIGHTS = [
    ("3,4 GB", "kleinstes empfohlenes Chat-Modell", "Qwen 3.5 4B deckt Mail + Tasks + Projekt-Status ab."),
    ("100%", "Dashboard-Injection abgewehrt", "Ministral, Gemma MLX und Qwen 3.6 erkennen den manipulierten Notizfall."),
    ("0", "Brain-Halluzinationen im Kernbench", "Die empfohlenen Brain-Modelle bleiben bei bekannten Notizquellen."),
]


def rounded(draw, box, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw, text, fnt):
    box = draw.textbbox((0, 0), text, font=fnt)
    return box[2] - box[0], box[3] - box[1]


def wrap(draw, text, fnt, max_width):
    words = text.split()
    lines, line = [], ""
    for word in words:
        candidate = word if not line else f"{line} {word}"
        if text_size(draw, candidate, fnt)[0] <= max_width:
            line = candidate
        else:
            if line:
                lines.append(line)
            line = word
    if line:
        lines.append(line)
    return lines


def text_block(draw, xy, text, fnt, fill=TEXT, max_width=500, gap=8):
    x, y = xy
    for line in wrap(draw, text, fnt, max_width):
        draw.text((x, y), line, font=fnt, fill=fill)
        y += fnt.size + gap
    return y


def pill(draw, x, y, text, fill, fg, outline=None, pad_x=22):
    fnt = font(25, bold=True)
    tw, _ = text_size(draw, text, fnt)
    box = (x, y, x + tw + pad_x * 2, y + 54)
    rounded(draw, box, 27, fill, outline or fill, 2)
    draw.text((x + pad_x, y + 15), text, font=fnt, fill=fg)
    return box


def verdict_style(verdict):
    return {
        "green": (GREEN_LIGHT, GREEN, "geeignet"),
        "yellow": (YELLOW_LIGHT, YELLOW, "mit Vorbehalt"),
        "red": (RED_LIGHT, RED, "gesperrt"),
        "untested": (GRAY_LIGHT, MUTED, "offen"),
        "na": ((246, 244, 239), (176, 169, 158), "n/a"),
    }[verdict]


def draw_check(draw, cx, cy, color, scale=1.0):
    w = int(18 * scale)
    draw.line((cx - w, cy, cx - w // 3, cy + w // 2, cx + w, cy - w), fill=color, width=max(3, int(5 * scale)))


def draw_cross(draw, cx, cy, color):
    draw.line((cx - 12, cy - 12, cx + 12, cy + 12), fill=color, width=5)
    draw.line((cx - 12, cy + 12, cx + 12, cy - 12), fill=color, width=5)


def draw_verdict(draw, box, verdict, is_default=False):
    x1, y1, x2, y2 = box
    fill, stroke, _ = verdict_style(verdict)
    rounded(draw, box, 14, fill, stroke if is_default else BORDER, 3 if is_default else 1)
    cx, cy = (x1 + x2) // 2, (y1 + y2) // 2
    if verdict == "green":
        draw_check(draw, cx, cy + 2, stroke, 1.15)
    elif verdict == "yellow":
        draw.polygon([(cx, cy - 17), (cx - 18, cy + 16), (cx + 18, cy + 16)], fill=stroke)
        draw.text((cx, cy + 2), "!", font=font(22, bold=True), fill=PAPER, anchor="mm")
    elif verdict == "red":
        draw_cross(draw, cx, cy, stroke)
    elif verdict == "untested":
        draw.text((cx, cy - 2), "?", font=font(30, bold=True), fill=stroke, anchor="mm")
    else:
        draw.text((cx, cy - 2), "-", font=font(30, bold=True), fill=stroke, anchor="mm")
    if is_default:
        draw.ellipse((x2 - 23, y1 + 7, x2 - 7, y1 + 23), fill=ORANGE)


def paste_logo(base, draw, x, y, size):
    logo = Image.open(LOGO).convert("RGBA").resize((size, size), Image.Resampling.LANCZOS)
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x + 4, y + 5, x + size + 4, y + size + 5), radius=18, fill=(0, 0, 0, 55))
    shadow = shadow.filter(ImageFilter.GaussianBlur(10))
    base.alpha_composite(shadow)
    rounded(draw, (x - 4, y - 4, x + size + 4, y + size + 4), 22, (255, 255, 255, 245))
    base.alpha_composite(logo, (x, y))


def add_shadow(base, box, radius=24, alpha=36):
    x1, y1, x2, y2 = box
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((x1 + 8, y1 + 10, x2 + 8, y2 + 10), radius=radius, fill=(0, 0, 0, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    base.alpha_composite(layer)


def build():
    img = Image.new("RGBA", (W, H), BG + (255,))
    draw = ImageDraw.Draw(img)
    draw.rectangle((0, 0, W, 410), fill=BRAND)
    draw.polygon([(1040, 0), (W, 0), (W, 410), (920, 410)], fill=(45, 39, 64))
    draw.ellipse((-190, 1220, 420, 1900), fill=(232, 242, 232, 120))
    draw.ellipse((1180, 980, 1810, 1650), fill=(246, 226, 207, 160))

    paste_logo(img, draw, M, 68, 78)
    draw.text((M + 112, 76), "MindGraph Notes", font=font(42, bold=True), fill=PAPER)
    draw.text((M + 115, 132), "Modellqualität lokaler KI", font=font(25), fill=(233, 225, 214))
    pill(draw, W - M - 430, 84, "Datenstand 07.06.2026", ORANGE_LIGHT, ORANGE)

    draw.text((M, 218), "Welche lokalen Modelle", font=font(62, bold=True, serif=True), fill=PAPER)
    draw.text((M, 292), "für welches Modul tragen.", font=font(62, bold=True, serif=True), fill=ORANGE_LIGHT)
    text_block(
        draw,
        (1040, 202),
        "Qualitätsnachweis aus Benchmark-Reports und produktiver Kompatibilitätsmatrix. Grün ist geeignet, Gelb dokumentiert Einschränkungen, Rot sperrt schadensrelevante Pfade.",
        font(24),
        fill=(245, 240, 232),
        max_width=420,
        gap=8,
    )

    # Highlight cards
    card_y = 470
    card_w = (W - 2 * M - 36) // 3
    for i, (value, title, detail) in enumerate(HIGHLIGHTS):
        x = M + i * (card_w + 18)
        box = (x, card_y, x + card_w, card_y + 178)
        add_shadow(img, box, 18, 18)
        rounded(draw, box, 18, PAPER, BORDER, 2)
        draw.text((x + 28, card_y + 24), value, font=font(47, bold=True, serif=True), fill=ORANGE)
        draw.text((x + 30, card_y + 82), title, font=font(25, bold=True), fill=TEXT)
        text_block(draw, (x + 30, card_y + 118), detail, font(20), fill=MUTED, max_width=card_w - 60, gap=5)

    # Heatmap
    heat = (M, 710, W - M, 1608)
    add_shadow(img, heat, 24, 24)
    rounded(draw, heat, 24, PAPER, BORDER, 2)
    draw.text((M + 36, 742), "Kompatibilitätsmatrix pro Modul", font=font(38, bold=True, serif=True), fill=TEXT)
    draw.text((M + 36, 790), "Punkt oben rechts = empfohlener Default in der App", font=font(22), fill=MUTED)

    grid_x = M + 360
    grid_y = 870
    cell_w = 145
    cell_h = 66
    row_h = 78

    for j, (_, label) in enumerate(MODULES):
        x = grid_x + j * cell_w
        draw.text((x + cell_w // 2, grid_y - 48), label, font=font(21, bold=True), fill=TEXT, anchor="mm")

    for i, model in enumerate(MODELS):
        y = grid_y + i * row_h
        draw.text((M + 38, y + 11), model["label"], font=font(24, bold=True), fill=TEXT)
        draw.text((M + 38, y + 42), f'{model["ram"]} · {model["note"]}', font=font(18), fill=MUTED)
        for j, (module_id, _) in enumerate(MODULES):
            x = grid_x + j * cell_w
            is_default = DEFAULTS.get(module_id) == model["id"]
            draw_verdict(draw, (x + 11, y, x + cell_w - 11, y + cell_h), model["verdicts"][module_id], is_default)

    legend_y = grid_y + len(MODELS) * row_h + 22
    legend = [("green", "geeignet"), ("yellow", "mit Vorbehalt"), ("red", "gesperrt"), ("untested", "nicht getestet")]
    x = M + 36
    for verdict, label in legend:
        fill, stroke, _ = verdict_style(verdict)
        rounded(draw, (x, legend_y, x + 42, legend_y + 30), 9, fill, stroke, 1)
        draw.text((x + 54, legend_y + 4), label, font=font(20), fill=MUTED)
        x += 248

    # Recommendations and evidence
    left = (M, 1660, M + 690, 2200)
    right = (M + 724, 1660, W - M, 2200)
    add_shadow(img, left, 20, 18)
    add_shadow(img, right, 20, 18)
    rounded(draw, left, 20, PAPER, BORDER, 2)
    rounded(draw, right, 20, PAPER, BORDER, 2)

    draw.text((left[0] + 32, left[1] + 32), "Empfohlene Einsatzlogik", font=font(34, bold=True, serif=True), fill=TEXT)
    recommendations = [
        ("Kleine Geräte", "qwen3.5:4b für Mail, Tasks und Projekt-Status."),
        ("Standard-Setup", "ministral-3:8b für Brain und Dashboard, qwen3.5:4b für Mailpfade."),
        ("Apple Silicon", "gemma4:12b-mlx als starke MLX-Option, besonders bei Task-Extraktion."),
        ("Maximale Qualität", "qwen3.6 oder qwen3.6:27b-mlx, wenn RAM und Laufzeit reichen."),
        ("Semantische Links", "bge-m3:latest als separates Embedding-Modell für Smart Connections."),
    ]
    y = left[1] + 96
    for title, detail in recommendations:
        draw_check(draw, left[0] + 52, y + 14, GREEN, 0.8)
        draw.text((left[0] + 82, y), title, font=font(23, bold=True), fill=TEXT)
        y = text_block(draw, (left[0] + 82, y + 31), detail, font(20), fill=MUTED, max_width=560, gap=4) + 18

    draw.text((right[0] + 32, right[1] + 32), "Testbasis", font=font(34, bold=True, serif=True), fill=TEXT)
    y = right[1] + 96
    for title, detail in EVIDENCE:
        rounded(draw, (right[0] + 34, y + 3, right[0] + 47, y + 16), 6, ORANGE)
        draw.text((right[0] + 62, y - 4), title, font=font(23, bold=True), fill=TEXT)
        y = text_block(draw, (right[0] + 62, y + 28), detail, font(19), fill=MUTED, max_width=610, gap=3) + 17

    footer_y = 2266
    draw.line((M, footer_y - 24, W - M, footer_y - 24), fill=BORDER, width=2)
    draw.text((M, footer_y), "Quellen im Repo: app/src/shared/modelCompatibility.ts", font=font(21, bold=True), fill=TEXT)
    draw.text((M, footer_y + 34), "Benchmark-Reports: /Users/jochenleeder/dev/brain-model-benchmark/results/*.md", font=font(20), fill=MUTED)
    draw.text((W - M, footer_y + 34), "lokal · nachvollziehbar · keine Cloud-Pflicht", font=font(21, bold=True), fill=ORANGE, anchor="ra")

    rgb_img = img.convert("RGB")
    rgb_img.save(PNG_OUT, quality=95)
    rgb_img.save(PDF_OUT, resolution=180)
    print(f"Wrote {PNG_OUT}")
    print(f"Wrote {PDF_OUT}")


if __name__ == "__main__":
    build()
