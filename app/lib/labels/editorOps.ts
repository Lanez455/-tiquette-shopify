import type { FieldKey, LabelElement, LabelTemplateLayout } from "./template";

// Opérations de l'éditeur visuel (F5). Pures : l'écran les applique à son état,
// les tests les vérifient sans navigateur.

export const SNAP_MM = 0.5;
const MIN_SIZE_MM = 2;

export const snap = (mm: number) => Math.round(mm / SNAP_MM) * SNAP_MM;
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export interface Bounds {
  widthMm: number;
  heightMm: number;
}

function replaceAt(layout: LabelTemplateLayout, index: number, element: LabelElement): LabelTemplateLayout {
  return { elements: layout.elements.map((e, i) => (i === index ? element : e)) };
}

// Déplace un élément en le gardant entièrement sur l'étiquette
export function moveElement(layout: LabelTemplateLayout, index: number, xMm: number, yMm: number, bounds: Bounds): LabelTemplateLayout {
  const e = layout.elements[index];
  if (!e) return layout;
  return replaceAt(layout, index, {
    ...e,
    xMm: clamp(snap(xMm), 0, bounds.widthMm - e.wMm),
    yMm: clamp(snap(yMm), 0, bounds.heightMm - e.hMm),
  });
}

export function resizeElement(layout: LabelTemplateLayout, index: number, wMm: number, hMm: number, bounds: Bounds): LabelTemplateLayout {
  const e = layout.elements[index];
  if (!e) return layout;
  return replaceAt(layout, index, {
    ...e,
    wMm: clamp(snap(wMm), MIN_SIZE_MM, bounds.widthMm - e.xMm),
    hMm: clamp(snap(hMm), MIN_SIZE_MM, bounds.heightMm - e.yMm),
  });
}

export function updateElement(layout: LabelTemplateLayout, index: number, patch: Partial<LabelElement>): LabelTemplateLayout {
  const e = layout.elements[index];
  if (!e) return layout;
  return replaceAt(layout, index, { ...e, ...patch } as LabelElement);
}

export function removeElement(layout: LabelTemplateLayout, index: number): LabelTemplateLayout {
  return { elements: layout.elements.filter((_, i) => i !== index) };
}

export type NewElement = { kind: "field"; field: FieldKey } | { kind: "text"; text: string } | { kind: "barcode" };

// Nouvel élément au centre, à une taille raisonnable pour l'étiquette
export function addElement(layout: LabelTemplateLayout, what: NewElement, bounds: Bounds): LabelTemplateLayout {
  const wMm = snap(Math.max(MIN_SIZE_MM, bounds.widthMm * (what.kind === "barcode" ? 0.8 : 0.5)));
  const hMm = snap(Math.max(MIN_SIZE_MM, bounds.heightMm * (what.kind === "barcode" ? 0.4 : 0.2)));
  const box = { xMm: snap((bounds.widthMm - wMm) / 2), yMm: snap((bounds.heightMm - hMm) / 2), wMm, hMm };
  const text = { maxFontSize: 10, minFontSize: 4, bold: false, align: "left" as const, maxLines: 2 };
  const element: LabelElement =
    what.kind === "barcode"
      ? { kind: "barcode", ...box, showDigits: true }
      : what.kind === "text"
        ? { kind: "text", text: what.text, ...box, ...text }
        : { kind: "field", field: what.field, ...box, ...text };
  return { elements: [...layout.elements, element] };
}

export const FIELD_LABELS: Record<string, string> = {
  title: "Titre du produit",
  variantTitle: "Variante",
  sku: "SKU",
  price: "Prix",
  compareAtPrice: "Prix barré",
  vendor: "Fournisseur",
  productType: "Type",
  barcodeDigits: "Numéro du code-barres",
};

// Données d'exemple pour l'aperçu de l'éditeur
export const SAMPLE: Record<string, string> = {
  title: "Boucles d'oreilles créoles argent 925",
  variantTitle: "Argent",
  sku: "BO-LUNE-925",
  price: "29,90 €",
  compareAtPrice: "39,90 €",
  vendor: "Atelier Lune",
  productType: "Bijoux",
  barcodeDigits: "2000000001234",
};
