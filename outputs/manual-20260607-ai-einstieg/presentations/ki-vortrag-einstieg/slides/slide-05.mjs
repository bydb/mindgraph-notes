import { C, footRule, kicker, rect, source, text } from "./helpers.mjs";

export async function slide05(presentation) {
  const slide = presentation.slides.add();
  rect(slide, 0, 0, 1280, 720, C.ink);
  kicker(slide, "UEBERGANG", "05");

  text(slide, "Die spannende Frage ist nicht:\nWer ist besser mit KI?", 56, 86, 900, 116, {
    size: 37,
    color: C.white,
    bold: true,
  });
  text(slide, "Sondern: Was passiert, wenn eure Selbstverstaendlichkeit und meine Bastler-Neugier zusammenkommen?", 58, 212, 820, 56, {
    size: 23,
    color: C.muted,
  });

  rect(slide, 92, 312, 300, 126, C.paper);
  text(slide, "Klasse 10", 122, 338, 220, 34, { size: 30, color: C.ink, bold: true });
  text(slide, "Tempo\nAusprobieren\nneuer Alltag", 124, 388, 210, 70, { size: 20, color: "#41434C" });

  rect(slide, 888, 312, 300, 126, C.paper);
  text(slide, "Gen X", 918, 338, 220, 34, { size: 30, color: C.ink, bold: true });
  text(slide, "Erfahrung\nSkepsis\nKontext", 920, 388, 210, 70, { size: 20, color: "#41434C" });

  rect(slide, 484, 280, 312, 190, C.amber);
  text(slide, "KI verstehen,\nnicht nur benutzen.", 510, 326, 260, 92, { size: 34, color: C.ink, bold: true, align: "center" });

  rect(slide, 392, 370, 92, 4, C.violet);
  rect(slide, 796, 370, 92, 4, C.violet);

  text(slide, "Heute geht es um KI, Agenten, Avatare und Vibe Coding als Werkzeuge, die wir kritisch und kreativ nutzen koennen.", 160, 548, 960, 60, {
    size: 24,
    color: C.white,
    align: "center",
  });
  footRule(slide);
  source(slide, "Synthesis aus Kanalzahlen und Studienlage: Nutzung, Interesse und Kompetenz unterscheiden sich nach Kontext und Alter.");
  return slide;
}
