import bwipjs from "bwip-js/node";
import { isValidGtin } from "../barcode/checksum";
import { MM_PER_INCH, PT_PER_INCH } from "./units";

export type BarcodeKind = "ean13" | "upca" | "ean8" | "code128";

export function barcodeKind(code: string): BarcodeKind {
  if (/^\d{13}$/.test(code) && isValidGtin(code)) return "ean13";
  if (/^\d{12}$/.test(code) && isValidGtin(code)) return "upca";
  if (/^\d{8}$/.test(code) && isValidGtin(code)) return "ean8";
  return "code128";
}

// Zone blanche minimale de chaque côté, en modules. Sans elle, les scanners
// ratent les EAN et UPC.
const QUIET_MODULES: Record<BarcodeKind, number> = { ean13: 11, upca: 9, ean8: 7, code128: 10 };
// Barre fine maximale : au-delà, le code devient démesuré sur une étiquette large
const MAX_MODULE_MM = 0.4;

export interface BarcodeGeometry {
  // Barres en points PDF, x depuis le bord gauche de la zone
  bars: { x: number; width: number }[];
  widthPt: number;
  moduleDots: number;
  // Faux si même une barre d'un seul point d'imprimante ne tient pas
  fits: boolean;
}

// Les barres sont calées sur la grille de points de l'imprimante : chaque barre
// fait un nombre entier de points. Sinon, une thermique à 203 ppp arrondit
// chaque barre différemment et le code ne se scanne plus.
export function barcodeGeometry(code: string, boxWidthPt: number, dpi: number): BarcodeGeometry {
  const kind = barcodeKind(code);
  const [raw] = bwipjs.raw(kind, code, "") as unknown as { sbs: number[] }[];
  const widths = raw!.sbs;
  const modules = widths.reduce((sum, w) => sum + w, 0);
  const dotPt = PT_PER_INCH / dpi;
  const total = modules + 2 * QUIET_MODULES[kind];
  const maxDots = Math.max(1, Math.floor(MAX_MODULE_MM / (MM_PER_INCH / dpi)));
  const fitDots = Math.floor(boxWidthPt / (total * dotPt));
  const moduleDots = Math.max(1, Math.min(maxDots, fitDots));

  const bars: BarcodeGeometry["bars"] = [];
  let cursor = 0;
  widths.forEach((w, i) => {
    // sbs alterne barre, espace, barre…
    if (i % 2 === 0) bars.push({ x: cursor * dotPt, width: w * moduleDots * dotPt });
    cursor += w * moduleDots;
  });
  return { bars, widthPt: cursor * dotPt, moduleDots, fits: fitDots >= 1 };
}

export const snapToDots = (pt: number, dpi: number) => {
  const dotPt = PT_PER_INCH / dpi;
  return Math.round(pt / dotPt) * dotPt;
};

export interface QrGeometry {
  // Carrés noirs en points PDF depuis le coin haut-gauche du QR, regroupés par ligne
  runs: { x: number; y: number; width: number; size: number }[];
  sizePt: number;
  moduleDots: number;
  fits: boolean;
}

// Zone blanche du QR, en modules. La norme en demande 4 ; 2 suffisent aux
// téléphones et laissent le code plus grand sur une petite étiquette.
const QR_QUIET_MODULES = 2;

// QR code calé sur les points de l'imprimante, comme les barres des codes-barres
export function qrGeometry(text: string, boxPt: number, dpi: number): QrGeometry {
  const [raw] = bwipjs.raw("qrcode", text, "eclevel=M") as unknown as { pixs: number[]; pixx: number; pixy: number }[];
  const n = raw!.pixx;
  const dotPt = PT_PER_INCH / dpi;
  const fitDots = Math.floor(boxPt / ((n + 2 * QR_QUIET_MODULES) * dotPt));
  const moduleDots = Math.max(1, fitDots);
  const m = moduleDots * dotPt;
  const runs: QrGeometry["runs"] = [];
  for (let y = 0; y < n; y++) {
    let x = 0;
    while (x < n) {
      if (!raw!.pixs[y * n + x]) { x++; continue; }
      const start = x;
      while (x < n && raw!.pixs[y * n + x]) x++;
      runs.push({ x: start * m, y: y * m, width: (x - start) * m, size: m });
    }
  }
  // Un module de moins de 2 points ne se lit plus au téléphone
  return { runs, sizePt: n * m, moduleDots, fits: fitDots >= 2 };
}
