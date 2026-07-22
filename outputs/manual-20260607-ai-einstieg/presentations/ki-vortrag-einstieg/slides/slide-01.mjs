import { C, footRule, kicker, pill, rect, source, text } from "./helpers.mjs";

export async function slide01(presentation) {
  const slide = presentation.slides.add();
  rect(slide, 0, 0, 1280, 720, C.ink);
  kicker(slide, "EINSTIEG", "01");

  text(slide, "Vom Heimcomputer zur KI", 56, 100, 620, 60, {
    size: 48,
    color: C.white,
    bold: true,
  });
  rect(slide, 56, 300, 500, 118, C.paper);
  text(slide, "Computer waren damals keine fertigen Apps.\nSie waren Maschinen, die man verstehen,\nausprobieren und manchmal ueberlisten musste.", 82, 324, 450, 78, {
    size: 18,
    color: C.ink,
    bold: true,
  });

  rect(slide, 730, 118, 2, 420, "#4A4E5A");
  const nodes = [
    ["C64", "erste digitale Abenteuer", 122, C.amber],
    ["Amiga 500", "Grafik, Sound, Basteln", 228, C.violet],
    ["Internet", "Wissen wird vernetzt", 334, C.mint],
    ["KI-Agenten", "Werkzeuge arbeiten mit", 440, C.violet2],
  ];
  for (const [headline, sub, y, color] of nodes) {
    rect(slide, 707, y + 6, 48, 48, color);
    text(slide, headline, 782, y, 330, 32, { size: 26, color: C.white, bold: true });
    text(slide, sub, 784, y + 34, 330, 22, { size: 15, color: C.muted });
  }
  pill(slide, "Heute: KI, Agenten, Avatare, Vibe Coding", 56, 560, 430, C.amber, C.ink);
  footRule(slide);
  source(slide, "Persoenlicher Einstieg: Jochen Leeder, Vortrag Friedrich-Magnus-Gesamtschule Laubach");
  return slide;
}
