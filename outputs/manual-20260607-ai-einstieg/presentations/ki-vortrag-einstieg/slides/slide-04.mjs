import { C, kicker, rect, source, text } from "./helpers.mjs";

export async function slide04(presentation) {
  const slide = presentation.slides.add();
  rect(slide, 0, 0, 1280, 720, C.ink);
  kicker(slide, "STUDIENKONTRAST", "04");

  text(slide, "Der Unterschied ist nicht Interesse, sondern Selbstverstaendlichkeit.", 56, 88, 920, 96, {
    size: 44,
    color: C.white,
    bold: true,
  });

  rect(slide, 70, 226, 520, 316, C.paper);
  text(slide, "Klasse 10 heute", 102, 254, 330, 38, { size: 30, color: C.ink, bold: true });
  text(slide, "Fast alle 16- bis 19-Jaehrigen nutzen generative KI.", 104, 314, 400, 56, { size: 22, color: C.ink, bold: true });
  text(slide, "Leibniz-HBI: knapp 96 % Nutzung bei 16-19.\nVodafone: 74 % der 14-20-Jaehrigen nutzen KI-Anwendungen.", 106, 398, 410, 86, { size: 18, color: "#41434C" });
  rect(slide, 104, 498, 340, 8, C.amber);

  rect(slide, 690, 226, 520, 316, C.paper);
  text(slide, "Jochen / Gen X", 722, 254, 330, 38, { size: 30, color: C.ink, bold: true });
  text(slide, "Erwachsene schauen genau hin, fuehlen sich aber seltener sicher.", 724, 314, 410, 56, { size: 22, color: C.ink, bold: true });
  text(slide, "FOM: 26 % der Gen X fuehlen sich sicher im Umgang mit KI.\nD21: Nutzen, Einfachheit und Zeitersparnis treiben Akzeptanz.", 726, 398, 410, 86, { size: 18, color: "#41434C" });
  rect(slide, 724, 498, 132, 8, C.violet);

  text(slide, "Tempo", 178, 568, 120, 28, { size: 22, color: C.amber, bold: true, align: "center" });
  text(slide, "+", 612, 558, 60, 42, { size: 42, color: C.white, bold: true, align: "center" });
  text(slide, "Erfahrung", 812, 568, 150, 28, { size: 22, color: C.violet2, bold: true, align: "center" });

  source(slide, "Quellen: Leibniz-HBI 2025; Vodafone Stiftung 2024; FOM Hochschule 2025; D21-Digital-Index 2024/25.");
  return slide;
}
