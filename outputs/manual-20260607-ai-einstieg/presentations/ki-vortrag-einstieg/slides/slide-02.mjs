import { C, footRule, kicker, rect, source, text } from "./helpers.mjs";

export async function slide02(presentation) {
  const slide = presentation.slides.add();
  rect(slide, 0, 0, 1280, 720, C.ink);
  kicker(slide, "VORURTEIL KIPPEN", "02");

  text(slide, "KI ist kein Jugendthema.", 56, 104, 760, 64, {
    size: 58,
    color: C.white,
    bold: true,
  });
  text(slide, "Zumindest nicht, wenn man sich anschaut, wer KI-Inhalte wirklich verfolgt.", 60, 184, 650, 58, {
    size: 24,
    color: C.muted,
  });

  rect(slide, 72, 316, 440, 168, C.ink2);
  text(slide, "6,5 %", 104, 342, 230, 68, { size: 62, color: C.amber, bold: true });
  text(slide, "13 bis 24 Jahre", 108, 426, 280, 30, { size: 22, color: C.white, bold: true });

  rect(slide, 594, 270, 560, 232, C.paper);
  text(slide, "80,5 %", 634, 304, 280, 82, { size: 78, color: C.ink, bold: true });
  text(slide, "35 Jahre und aelter", 640, 404, 360, 34, { size: 26, color: C.ink, bold: true });
  text(slide, "Die groesste Neugier sitzt nicht nur im Klassenzimmer, sondern auch mitten im Berufsleben.", 642, 450, 420, 44, { size: 17, color: C.ink });

  footRule(slide);
  source(slide, "Quelle: Nutzer-Screenshot, Everlast AI YouTube-Kanalstatistik; abgeleitet: 13-24 = 3,8 + 2,7; 35+ = 25,6 + 25,5 + 20,4 + 9,0.");
  return slide;
}
