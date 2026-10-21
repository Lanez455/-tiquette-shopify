import type { LabelVariant } from "../shopify/catalog";
import type { LabelItem } from "../labels/template";

export type DefaultQuantity = "zero" | "one" | "stock";

// Quantité proposée à l'ouverture (F13). Jamais 1 imposé : c'est le réglage du marchand.
export function initialQuantity(setting: DefaultQuantity, inventory: number | null): number {
  if (setting === "one") return 1;
  if (setting === "stock") return Math.max(0, Math.min(inventory ?? 0, MAX_PER_LINE));
  return 0;
}

export const MAX_PER_LINE = 1000;
export const MAX_PER_JOB = 5000;

export interface PrintLine {
  variantId: string;
  quantity: number;
}

export class PrintJobError extends Error {}

// Une ligne × quantité devient autant d'étiquettes, dans l'ordre de la liste
export function expandLines(lines: PrintLine[], variants: LabelVariant[]): LabelItem[] {
  const byId = new Map(variants.map((v) => [v.variantId, v]));
  const items: LabelItem[] = [];
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity < 0 || line.quantity > MAX_PER_LINE) {
      throw new PrintJobError(`Quantité invalide (0 à ${MAX_PER_LINE})`);
    }
    const variant = byId.get(line.variantId);
    if (!variant || line.quantity === 0) continue;
    for (let i = 0; i < line.quantity; i++) items.push(variant);
    if (items.length > MAX_PER_JOB) throw new PrintJobError(`${MAX_PER_JOB} étiquettes au maximum par impression`);
  }
  return items;
}

export interface TemplateRule {
  templateId: string;
  collectionIds: string[];
}

// Modèle automatique par collection (F20) : la première règle dont une
// collection contient le produit gagne ; sinon, le modèle par défaut.
export function templateFor(variant: Pick<LabelVariant, "collectionIds">, rules: TemplateRule[], fallback: string): string {
  for (const rule of rules) {
    if (rule.collectionIds.some((id) => variant.collectionIds.includes(id))) return rule.templateId;
  }
  return fallback;
}

// Regroupe les lignes par modèle : chaque groupe est une impression séparée,
// car un rouleau ne change pas de format en cours de route.
export function groupLinesByTemplate(
  lines: PrintLine[],
  variants: LabelVariant[],
  rules: TemplateRule[],
  fallback: string,
): Map<string, PrintLine[]> {
  const byId = new Map(variants.map((v) => [v.variantId, v]));
  const groups = new Map<string, PrintLine[]>();
  for (const line of lines) {
    const variant = byId.get(line.variantId);
    if (!variant || line.quantity === 0) continue;
    const templateId = templateFor(variant, rules, fallback);
    groups.set(templateId, [...(groups.get(templateId) ?? []), line]);
  }
  return groups;
}
