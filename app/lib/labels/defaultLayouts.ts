import type { LabelFormat } from "./formats";
import type { LabelTemplateLayout } from "./template";

// Marge laissée vide sur le bord : les têtes thermiques n'impriment pas jusqu'au bord
export const SAFE_MARGIN_MM = 1.5;

// Mise en page de départ proposée pour chaque format, que le marchand modifie
// ensuite dans l'éditeur (F5).
// Le titre est suivi de la variante : « Bague Lune · 52 » et « · 54 » se distinguent.
export function defaultLayout(format: Pick<LabelFormat, "widthMm" | "heightMm"> & { use?: "shelf" }): LabelTemplateLayout {
  const m = SAFE_MARGIN_MM;
  const w = format.widthMm - 2 * m;
  const h = format.heightMm - 2 * m;

  // Étiquette de rayon (F22) : prix lisible de loin, QR code vers la fiche produit
  if (format.use === "shelf") {
    const qr = Math.min(h * 0.62, w * 0.36);
    const left = w - qr - 2;
    return {
      elements: [
        { kind: "field", field: "titleWithVariant", xMm: m, yMm: m, wMm: left, hMm: h * 0.3, maxFontSize: 11, minFontSize: 5, bold: true, maxLines: 2 },
        { kind: "field", field: "price", xMm: m, yMm: m + h * 0.3, wMm: left, hMm: h * 0.32, maxFontSize: 30, minFontSize: 10, bold: true, maxLines: 1 },
        { kind: "field", field: "compareAtPrice", xMm: m, yMm: m + h * 0.62, wMm: left, hMm: h * 0.12, maxFontSize: 10, minFontSize: 5, maxLines: 1 },
        { kind: "qr", xMm: m + w - qr, yMm: m, wMm: qr, hMm: qr },
        { kind: "barcode", xMm: m, yMm: m + h * 0.76, wMm: w, hMm: h * 0.24, showDigits: true },
      ],
    };
  }

  // Très petites étiquettes (bijoux) : un code-barres n'y serait pas lisible
  if (format.widthMm < 22 || format.heightMm < 9) {
    return {
      elements: [
        { kind: "field", field: "price", xMm: m, yMm: m, wMm: w, hMm: h * 0.6, maxFontSize: 9, minFontSize: 4, bold: true, align: "center", maxLines: 1 },
        { kind: "field", field: "sku", xMm: m, yMm: m + h * 0.6, wMm: w, hMm: h * 0.4, maxFontSize: 6, minFontSize: 3, align: "center", maxLines: 1 },
      ],
    };
  }

  // Petites étiquettes basses (1" × 1/2") : prix en haut, code-barres sur toute la largeur
  if (format.heightMm < 16 && format.widthMm < 40) {
    return {
      elements: [
        { kind: "field", field: "price", xMm: m, yMm: m, wMm: w, hMm: h * 0.3, maxFontSize: 7, minFontSize: 3.5, bold: true, align: "center", maxLines: 1 },
        { kind: "barcode", xMm: m, yMm: m + h * 0.3, wMm: w, hMm: h * 0.7, showDigits: true },
      ],
    };
  }

  // Étiquettes basses et larges : texte à gauche, code-barres à droite
  if (format.heightMm < 16) {
    const textW = Math.min(w * 0.38, 22);
    return {
      elements: [
        { kind: "field", field: "titleWithVariant", xMm: m, yMm: m, wMm: textW, hMm: h * 0.6, maxFontSize: 7, minFontSize: 3.5, maxLines: 3 },
        { kind: "field", field: "price", xMm: m, yMm: m + h * 0.6, wMm: textW, hMm: h * 0.4, maxFontSize: 8, minFontSize: 4, bold: true, maxLines: 1 },
        { kind: "barcode", xMm: m + textW + 1, yMm: m, wMm: w - textW - 1, hMm: h, showDigits: true },
      ],
    };
  }

  // Cas général : titre, prix, puis code-barres sur la moitié basse
  const titleH = h * 0.3;
  const priceH = h * 0.18;
  return {
    elements: [
      { kind: "field", field: "titleWithVariant", xMm: m, yMm: m, wMm: w, hMm: titleH, maxFontSize: 10, minFontSize: 3.5, maxLines: 3 },
      { kind: "field", field: "price", xMm: m, yMm: m + titleH, wMm: w * 0.52, hMm: priceH, maxFontSize: 12, minFontSize: 5, bold: true, maxLines: 1 },
      { kind: "field", field: "compareAtPrice", xMm: m + w * 0.56, yMm: m + titleH, wMm: w * 0.44, hMm: priceH, maxFontSize: 9, minFontSize: 4, align: "right", maxLines: 1 },
      { kind: "barcode", xMm: m, yMm: m + titleH + priceH + 0.5, wMm: w, hMm: h - titleH - priceH - 0.5, showDigits: true },
    ],
  };
}
