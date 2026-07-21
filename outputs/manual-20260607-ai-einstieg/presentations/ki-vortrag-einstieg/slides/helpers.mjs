export const C = {
  ink: "#111319",
  ink2: "#1B1E27",
  paper: "#F2EEE7",
  white: "#FFFFFF",
  muted: "#A9ADB8",
  violet: "#B778F2",
  violet2: "#D7B6FF",
  amber: "#F2B84B",
  mint: "#52C7A3",
  red: "#F06A6A",
};

const transparent = { color: "#FFFFFF", transparency: 100000 };

export function rect(slide, x, y, width, height, fill, line = { fill: { type: "none" } }) {
  return slide.shapes.add({
    geometry: "rect",
    position: { left: x, top: y, width, height },
    fill,
    line,
  });
}

export function text(slide, value, x, y, width, height, opts = {}) {
  const shape = slide.shapes.add({
    geometry: "rect",
    position: { left: x, top: y, width, height },
    fill: transparent,
    line: { style: "solid", fill: transparent, width: 0 },
  });
  shape.text = value;
  shape.text.typeface = opts.typeface || "Avenir Next";
  shape.text.fontSize = opts.size || 24;
  shape.text.color = opts.color || C.white;
  shape.text.bold = Boolean(opts.bold);
  shape.text.alignment = opts.align || "left";
  shape.text.verticalAlignment = opts.valign || "top";
  shape.text.insets = opts.insets || { top: 0, right: 0, bottom: 0, left: 0 };
  if (opts.lineSpacing) shape.text.lineSpacing = opts.lineSpacing < 10 ? Math.round(opts.lineSpacing * 100) : opts.lineSpacing;
  return shape;
}

export function kicker(slide, label, n = "01") {
  rect(slide, 56, 44, 11, 11, C.amber);
  text(slide, label, 78, 36, 360, 28, {
    size: 14,
    color: C.muted,
    bold: true,
    valign: "middle",
  });
  text(slide, n, 1188, 668, 36, 20, {
    size: 12,
    color: C.muted,
    align: "right",
  });
}

export function source(slide, value) {
  text(slide, value, 56, 672, 900, 18, {
    size: 10,
    color: C.muted,
  });
}

export function pill(slide, value, x, y, width, fill, color = C.ink) {
  rect(slide, x, y, width, 34, fill);
  text(slide, value, x + 14, y + 6, width - 28, 20, {
    size: 13,
    color,
    bold: true,
    align: "center",
    valign: "middle",
  });
}

export function bar(slide, label, pct, x, y, maxWidth, color = C.violet) {
  text(slide, label, x, y - 2, 220, 24, { size: 17, color: C.ink, bold: true });
  rect(slide, x + 250, y + 2, maxWidth, 16, "#DED8CE");
  rect(slide, x + 250, y + 2, Math.max(8, maxWidth * pct / 26), 16, color);
  text(slide, `${pct.toLocaleString("de-DE", { minimumFractionDigits: 1 })} %`, x + 250 + maxWidth + 24, y - 4, 88, 28, {
    size: 21,
    color: C.ink,
    bold: true,
    align: "right",
  });
}

export function footRule(slide) {
  rect(slide, 56, 640, 1168, 1, "#3A3D46");
}
