import { normalizeBarcode } from "./checksum";
import { allocateCodes, type Symbology } from "./generate";

export interface VariantBarcode {
  variantId: string;
  barcode: string | null;
}

export interface BarcodeAssignment {
  variantId: string;
  oldValue: string | null;
  newValue: string;
}

export interface BarcodePlan {
  assignments: BarcodeAssignment[];
  nextCounter: number;
  // Variantes laissées telles quelles parce qu'elles ont déjà un code
  keptCount: number;
}

export type PlanMode =
  | { kind: "missing" }
  // Remplacement en masse : refusé sans la phrase de confirmation exacte (F11)
  | { kind: "replace"; confirmation: string };

export function replaceConfirmationPhrase(count: number): string {
  return `REMPLACER ${count}`;
}

export class ConfirmationRequiredError extends Error {
  constructor(public readonly expected: string) {
    super(`Confirmation requise : tapez « ${expected} »`);
  }
}

const hasBarcode = (v: VariantBarcode) => Boolean(v.barcode && v.barcode.trim());

// Calcule les écritures à faire, sans rien écrire. Par défaut, seules les
// variantes sans code en reçoivent un : un code existant n'est jamais touché.
export function planBarcodes(
  variants: VariantBarcode[],
  catalog: VariantBarcode[],
  symbology: Symbology,
  startCounter: number,
  mode: PlanMode = { kind: "missing" },
): BarcodePlan {
  const targets = mode.kind === "missing" ? variants.filter((v) => !hasBarcode(v)) : variants;

  if (mode.kind === "replace") {
    const replaced = variants.filter(hasBarcode).length;
    const expected = replaceConfirmationPhrase(replaced);
    if (replaced > 0 && mode.confirmation !== expected) {
      throw new ConfirmationRequiredError(expected);
    }
  }

  // Les codes du catalogue entier restent réservés, y compris ceux qu'on remplace :
  // un ancien code peut encore être collé sur un article en rayon.
  const taken = catalog.map((v) => v.barcode ?? "");
  const { codes, nextCounter } = allocateCodes(targets.length, symbology, startCounter, taken);

  return {
    assignments: targets.map((v, i) => ({
      variantId: v.variantId,
      oldValue: hasBarcode(v) ? v.barcode : null,
      newValue: codes[i]!,
    })),
    nextCounter,
    keptCount: variants.length - targets.length,
  };
}

// Doublons dans le catalogue (écran Codes-barres et alertes de l'accueil)
export function findDuplicates(catalog: VariantBarcode[]): Map<string, string[]> {
  const byCode = new Map<string, string[]>();
  for (const v of catalog) {
    if (!hasBarcode(v)) continue;
    const key = normalizeBarcode(v.barcode!);
    byCode.set(key, [...(byCode.get(key) ?? []), v.variantId]);
  }
  return new Map([...byCode].filter(([, ids]) => ids.length > 1));
}
