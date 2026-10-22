import { normalizeBarcode, withCheckDigit } from "./checksum";

export type Symbology = "ean13" | "upca" | "code128";

// Plages réservées à l'usage interne d'un magasin, qui ne peuvent pas entrer en
// collision avec un vrai code fabricant :
// - EAN-13 « 20 » : préfixe GS1 de diffusion restreinte ;
// - UPC-A « 4 » : système de numérotation réservé aux codes attribués en magasin ;
// - Code 128 : préfixe alphabétique, jamais pris pour un GTIN.
// Le numéro vient d'un compteur propre à la boutique, jamais de l'ID de variante
// (cause des doublons de l'app officielle).
const RANGES: Record<Symbology, { prefix: string; digits: number; check: boolean }> = {
  ean13: { prefix: "20", digits: 10, check: true },
  upca: { prefix: "4", digits: 10, check: true },
  code128: { prefix: "LB", digits: 8, check: false },
};

export function buildInternalCode(symbology: Symbology, counter: number): string {
  const range = RANGES[symbology];
  if (!Number.isInteger(counter) || counter < 1 || counter >= 10 ** range.digits) {
    throw new Error(`Compteur hors plage pour ${symbology} : ${counter}`);
  }
  const body = range.prefix + String(counter).padStart(range.digits, "0");
  return range.check ? withCheckDigit(body) : body;
}

export interface AllocationResult {
  codes: string[];
  nextCounter: number;
}

// Attribue `count` codes inédits. `taken` contient tous les codes déjà présents
// dans le catalogue ; un code déjà pris est sauté, jamais réutilisé.
export function allocateCodes(
  count: number,
  symbology: Symbology,
  startCounter: number,
  taken: Iterable<string>,
): AllocationResult {
  const used = new Set<string>();
  for (const code of taken) if (code) used.add(normalizeBarcode(code));

  const codes: string[] = [];
  let counter = startCounter;
  while (codes.length < count) {
    const code = buildInternalCode(symbology, counter);
    counter++;
    const key = normalizeBarcode(code);
    if (used.has(key)) continue;
    used.add(key);
    codes.push(code);
  }
  return { codes, nextCounter: counter };
}
