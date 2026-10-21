import type { ResolvedTemplate } from "../labels/templates.server";
import { renderLabels } from "../labels/pdf.server";
import type { PriceOptions } from "../labels/price";
import type { StartCell } from "../labels/sheet";
import { fetchVariantsForLabels, type LabelVariant } from "../shopify/catalog";
import type { Gql } from "../shopify/graphql";
import { AUTO_TEMPLATE, expandLines, groupLinesByTemplate, PrintJobError, type PrintLine } from "./job";

export interface PrintSettings {
  offsetXmm: number;
  offsetYmm: number;
  rotate90: boolean;
  printerDpi: number;
  price: PriceOptions;
}

export interface PrintGroup {
  templateId: string;
  templateName: string;
  labelCount: number;
  pdf: Uint8Array;
  warnings: string[];
}


// Prépare une ou plusieurs impressions (une par modèle) à partir des lignes choisies
export async function renderPrintGroups(args: {
  gql: Gql;
  lines: PrintLine[];
  templates: ResolvedTemplate[];
  templateId: string;
  fallbackTemplateId: string;
  settings: PrintSettings;
  start?: StartCell;
  // Aperçu : une seule étiquette, rien n'est enregistré
  preview?: boolean;
}): Promise<{ groups: PrintGroup[]; variants: LabelVariant[] }> {
  const { gql, templates, settings } = args;
  const lines = args.preview ? args.lines.filter((l) => l.quantity > 0).slice(0, 1).map((l) => ({ ...l, quantity: 1 })) : args.lines;
  if (!lines.some((l) => l.quantity > 0)) throw new PrintJobError("Aucune étiquette à imprimer : toutes les quantités sont à 0.");

  const variants = await fetchVariantsForLabels(gql, lines.map((l) => l.variantId));
  const byId = new Map(templates.map((t) => [t.id, t]));
  const rules = templates.filter((t) => t.collectionIds.length).map((t) => ({ templateId: t.id, collectionIds: t.collectionIds }));
  const grouped =
    args.templateId === AUTO_TEMPLATE
      ? groupLinesByTemplate(lines, variants, rules, args.fallbackTemplateId)
      : new Map([[args.templateId, lines]]);

  const groups: PrintGroup[] = [];
  for (const [templateId, groupLines] of grouped) {
    const template = byId.get(templateId);
    if (!template) throw new PrintJobError("Modèle introuvable");
    const items = expandLines(groupLines, variants);
    if (!items.length) continue;
    const result = await renderLabels({
      format: template.format,
      layout: template.layout,
      items,
      price: settings.price,
      start: args.start,
      offsetXMm: settings.offsetXmm,
      offsetYMm: settings.offsetYmm,
      rotate90: settings.rotate90,
      printerDpi: template.format.kind === "sheet" ? undefined : settings.printerDpi,
    });
    const warnings: string[] = [];
    if (result.overflows.length) warnings.push(`${result.overflows.length} textes trop longs, même en petit`);
    if (result.barcodeTooWide.length) warnings.push(`${result.barcodeTooWide.length} codes-barres trop larges pour leur zone`);
    const missing = items.filter((i) => !i.barcode).length;
    if (missing && template.layout.elements.some((e) => e.kind === "barcode")) {
      warnings.push(`${missing} étiquettes sans code-barres : créez-les depuis l'écran Codes-barres`);
    }
    groups.push({ templateId, templateName: template.name, labelCount: items.length, pdf: result.pdf, warnings });
  }
  return { groups, variants };
}
