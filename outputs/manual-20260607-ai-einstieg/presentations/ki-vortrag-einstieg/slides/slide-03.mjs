import { C, bar, kicker, rect, source, text } from "./helpers.mjs";

export async function slide03(presentation) {
  const slide = presentation.slides.add();
  rect(slide, 0, 0, 1280, 720, C.paper);
  kicker(slide, "BEWEISOBJEKT", "03");

  text(slide, "Bei einem KI-Kanal liegt die Mitte des Publikums mitten im Berufsleben.", 56, 88, 780, 96, {
    size: 38,
    color: C.ink,
    bold: true,
  });
  text(slide, "Altersverteilung Everlast AI", 56, 190, 360, 26, { size: 18, color: "#62636A", bold: true });

  const rows = [
    ["13 bis 17 Jahre", 3.8],
    ["18 bis 24 Jahre", 2.7],
    ["25 bis 34 Jahre", 13.0],
    ["35 bis 44 Jahre", 25.6],
    ["45 bis 54 Jahre", 25.5],
    ["55 bis 64 Jahre", 20.4],
    ["ueber 65 Jahre", 9.0],
  ];
  rows.forEach(([label, pct], index) => bar(slide, label, pct, 92, 246 + index * 50, 400, pct >= 20 ? C.violet : C.violet2));

  rect(slide, 950, 250, 224, 148, C.ink);
  text(slide, "29,4 %", 978, 278, 166, 58, { size: 48, color: C.amber, bold: true });
  text(slide, "sind 55 Jahre oder aelter", 980, 346, 160, 46, { size: 17, color: C.white, bold: true });
  text(slide, "Das ist genau die Altersgruppe, in der viele berufliche Erfahrung und Skepsis mitbringen.", 952, 430, 238, 90, { size: 17, color: C.ink });

  source(slide, "Quelle: Nutzer-Screenshot, Everlast AI YouTube-Kanalstatistik. Hinweis: Kanalpublikum, nicht repraesentativ fuer die Gesamtbevoelkerung.");
  return slide;
}
