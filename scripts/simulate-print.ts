// Simule l'impression de tous les formats prêts et écrit les images dans simulation/.
// Usage : npm run simulate            (203 ppp)
//         npm run simulate -- 300     (300 ppp)
import { mkdirSync, writeFileSync } from "node:fs";
import { buildInternalCode } from "../app/lib/barcode/generate";
import { defaultLayout } from "../app/lib/labels/defaultLayouts";
import { FORMATS } from "../app/lib/labels/formats";
import { renderLabels } from "../app/lib/labels/pdf";
import { inkMarginMm, printPdf, scanPrinted, toPng } from "../app/testing/printSimulator";

const dpi = Number(process.argv[2] ?? 203) as 203 | 300;
const outDir = "simulation";
mkdirSync(outDir, { recursive: true });

const item = {
  title: "Boucles d'oreilles créoles argent 925 et zircon, modèle Lune",
  price: "29.90",
  compareAtPrice: "39.90",
  sku: "BO-LUNE-925",
  barcode: buildInternalCode("ean13", 123),
};

const rows: string[] = [];
for (const format of FORMATS) {
  const { pdf } = await renderLabels({
    format,
    layout: defaultLayout(format),
    items: [item],
    price: { currency: "EUR", locale: "fr-FR" },
    printerDpi: format.kind === "sheet" ? 600 : dpi,
  });
  const [page] = await printPdf(pdf, format.kind === "sheet" ? 300 : dpi);
  const file = `${format.id}.png`;
  writeFileSync(`${outDir}/${file}`, toPng(page!));
  const scan = scanPrinted(page!);
  const status = format.kind === "sheet" ? "planche" : scan === item.barcode ? "scan OK" : scan ? `lu : ${scan}` : "pas de code";
  rows.push(`${format.id}\t${status}\tmarge ${inkMarginMm(page!).toFixed(1)} mm`);
  console.log(rows.at(-1));
}
writeFileSync(`${outDir}/resultats.txt`, rows.join("\n") + "\n");
