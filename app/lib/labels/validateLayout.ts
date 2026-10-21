import type { FieldKey, LabelElement, LabelTemplateLayout, TextStyle } from "./template";

const FIELDS: FieldKey[] = ["title", "variantTitle", "sku", "price", "compareAtPrice", "vendor", "productType", "barcodeDigits"];
const isField = (f: unknown): f is FieldKey =>
  typeof f === "string" &&
  (FIELDS.includes(f as FieldKey) || /^metafield:(product|variant)\.[\w-]+\.[\w-]+$/.test(f));

const num = (v: unknown, min: number, max: number) => typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

export class LayoutError extends Error {}

// Contrôle un modèle venu de l'éditeur (ou de la base) avant de l'utiliser :
// un modèle invalide ne doit jamais produire une étiquette fausse en silence.
export function validateLayout(input: unknown, widthMm: number, heightMm: number): LabelTemplateLayout {
  if (!input || typeof input !== "object" || !Array.isArray((input as { elements?: unknown }).elements)) {
    throw new LayoutError("Modèle illisible");
  }
  const elements = (input as { elements: unknown[] }).elements;
  if (elements.length > 30) throw new LayoutError("30 éléments au maximum");
  const out: LabelElement[] = elements.map((raw, i) => {
    const e = raw as Record<string, unknown>;
    const where = `Élément ${i + 1}`;
    if (!num(e.xMm, 0, widthMm) || !num(e.yMm, 0, heightMm) || !num(e.wMm, 0.5, widthMm) || !num(e.hMm, 0.5, heightMm)) {
      throw new LayoutError(`${where} : position ou taille invalide`);
    }
    if ((e.xMm as number) + (e.wMm as number) > widthMm + 0.01 || (e.yMm as number) + (e.hMm as number) > heightMm + 0.01) {
      throw new LayoutError(`${where} : dépasse de l'étiquette`);
    }
    const box = { xMm: e.xMm as number, yMm: e.yMm as number, wMm: e.wMm as number, hMm: e.hMm as number };
    if (e.kind === "barcode") return { kind: "barcode", ...box, showDigits: e.showDigits !== false };
    if (e.kind === "qr") return { kind: "qr", ...box };
    if (!num(e.maxFontSize, 2, 72) || !num(e.minFontSize, 2, 72) || (e.minFontSize as number) > (e.maxFontSize as number)) {
      throw new LayoutError(`${where} : tailles de police invalides`);
    }
    const style: TextStyle = {
      maxFontSize: e.maxFontSize as number,
      minFontSize: e.minFontSize as number,
      bold: e.bold === true,
      align: e.align === "center" || e.align === "right" ? e.align : "left",
      ...(num(e.maxLines, 1, 10) ? { maxLines: e.maxLines as number } : {}),
    };
    if (e.kind === "text") {
      if (typeof e.text !== "string" || e.text.length > 200) throw new LayoutError(`${where} : texte invalide`);
      return { kind: "text", text: e.text, ...box, ...style };
    }
    if (e.kind === "field" && isField(e.field)) return { kind: "field", field: e.field, ...box, ...style };
    throw new LayoutError(`${where} : type inconnu`);
  });
  return { elements: out };
}
