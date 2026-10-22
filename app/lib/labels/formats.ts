import { inToMm } from "./units";

// Bibliothèque de formats prêts (F2). Toutes les dimensions sont en mm.
// Chaque format doit être validé sur une vraie imprimante avant le lancement
// (plan de tests du cahier des charges).

export type LabelShape = "rect" | "round";

export interface RollFormat {
  kind: "roll";
  id: string;
  name: string;
  brand: "Dymo" | "Zebra" | "Brother" | "Bijoux";
  widthMm: number;
  heightMm: number;
  shape: LabelShape;
  // Étiquette de rayon (F22) : gros prix et QR code vers la fiche produit
  use?: "shelf";
}

// Planche A4 / Letter pour imprimante laser ou jet d'encre
export interface SheetFormat {
  kind: "sheet";
  id: string;
  name: string;
  brand: "Avery";
  pageWidthMm: number;
  pageHeightMm: number;
  columns: number;
  rows: number;
  widthMm: number;
  heightMm: number;
  marginLeftMm: number;
  marginTopMm: number;
  // Distance entre le début d'une étiquette et le début de la suivante
  pitchXMm: number;
  pitchYMm: number;
  shape: LabelShape;
}

export type LabelFormat = RollFormat | SheetFormat;

const roll = (
  id: string,
  name: string,
  brand: RollFormat["brand"],
  widthMm: number,
  heightMm: number,
  shape: LabelShape = "rect",
): RollFormat => ({ kind: "roll", id, name, brand, widthMm, heightMm, shape });

const LETTER = { pageWidthMm: inToMm(8.5), pageHeightMm: inToMm(11) };

export const FORMATS: LabelFormat[] = [
  roll("dymo-30252", "Dymo 30252 (adresse)", "Dymo", inToMm(3.5), inToMm(1.125)),
  roll("dymo-30299", "Dymo 30299 (bijoux / prix)", "Dymo", inToMm(0.75), inToMm(0.375)),
  roll("dymo-30332", "Dymo 30332 (1\" × 1\")", "Dymo", inToMm(1), inToMm(1)),
  roll("dymo-30333", "Dymo 30333 (1\" × 1/2\")", "Dymo", inToMm(1), inToMm(0.5)),
  roll("dymo-30334", "Dymo 30334 (2 1/4\" × 1 1/4\")", "Dymo", inToMm(2.25), inToMm(1.25)),
  roll("dymo-30336", "Dymo 30336 (2 1/8\" × 1\")", "Dymo", inToMm(2.125), inToMm(1)),
  roll("zebra-2x1", "Zebra 2\" × 1\"", "Zebra", inToMm(2), inToMm(1)),
  roll("zebra-1x1", "Zebra 1\" × 1\"", "Zebra", inToMm(1), inToMm(1)),
  roll("brother-dk1201", "Brother DK-1201 (29 × 90 mm)", "Brother", 90, 29),
  roll("brother-dk2205", "Brother DK-2205 (continu 62 mm)", "Brother", 62, 29),
  { ...roll("rayon-zebra-3x2", "Étiquette de rayon Zebra 3\" × 2\" (prix + QR)", "Zebra", inToMm(3), inToMm(2)), use: "shelf" },
  roll("bijou-halteres", "Bijoux, étiquette haltère (2 3/16\" × 15/32\")", "Bijoux", inToMm(2.1875), inToMm(0.46875)),
  {
    kind: "sheet",
    id: "avery-5160",
    name: "Avery 5160 (30 par planche)",
    brand: "Avery",
    ...LETTER,
    columns: 3,
    rows: 10,
    widthMm: inToMm(2.625),
    heightMm: inToMm(1),
    marginLeftMm: inToMm(0.1875),
    marginTopMm: inToMm(0.5),
    pitchXMm: inToMm(2.75),
    pitchYMm: inToMm(1),
    shape: "rect",
  },
  {
    kind: "sheet",
    id: "avery-5167",
    name: "Avery 5167 (80 par planche)",
    brand: "Avery",
    ...LETTER,
    columns: 4,
    rows: 20,
    widthMm: inToMm(1.75),
    heightMm: inToMm(0.5),
    marginLeftMm: inToMm(0.3),
    marginTopMm: inToMm(0.5),
    pitchXMm: inToMm(2.05),
    pitchYMm: inToMm(0.5),
    shape: "rect",
  },
];

export function getFormat(id: string): LabelFormat | undefined {
  return FORMATS.find((f) => f.id === id);
}

// Taille libre (F1)
export function customFormat(widthMm: number, heightMm: number, shape: LabelShape = "rect"): RollFormat {
  if (!(widthMm > 0 && heightMm > 0) || widthMm > 300 || heightMm > 300) {
    throw new Error("Dimensions d'étiquette invalides (entre 0 et 300 mm)");
  }
  return roll("custom", "Taille libre", "Bijoux", widthMm, heightMm, shape);
}
