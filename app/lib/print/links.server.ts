import type { ResolvedTemplate } from "../labels/templates.server";
import { expandToVariantIds, fetchVariantsForLabels, type LabelVariant } from "../shopify/catalog";
import type { Gql } from "../shopify/graphql";
import { AUTO_TEMPLATE, MAX_PER_JOB, MAX_PER_LINE, PrintJobError, type PrintLine } from "./job";
import { renderPrintGroups, type PrintSettings } from "./render.server";

// Demande venue du bouton Imprimer de l'admin ou de la caisse (F15)
export interface LinkRequest {
  // Produits ou variantes sélectionnés (admin) : chaque variante reçoit `quantity`
  ids?: string[];
  quantity?: number | "stock";
  // Lignes déjà chiffrées (panier de la caisse)
  lines?: PrintLine[];
  templateId?: string;
}

export const LINK_SOURCES = new Set(["product", "pos"]);
const MAX_IDS = 250;

function checkQuantity(quantity: number) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_PER_LINE) {
    throw new PrintJobError(`Quantité invalide (0 à ${MAX_PER_LINE})`);
  }
}

// Le lien imprime un seul PDF : on fixe donc un modèle précis. Le choix
// automatique par collection pourrait mélanger deux formats de rouleau.
function pickTemplate(templateId: string | undefined, templates: ResolvedTemplate[], fallback: string): string {
  const id = !templateId || templateId === AUTO_TEMPLATE ? fallback : templateId;
  if (!templates.some((t) => t.id === id)) throw new PrintJobError("Modèle introuvable");
  return id;
}

// Transforme la demande en lignes à imprimer, sans rien enregistrer
export async function planLinkedJob(
  gql: Gql,
  request: LinkRequest,
  templates: ResolvedTemplate[],
  fallbackTemplateId: string,
): Promise<{ lines: PrintLine[]; templateId: string; labelCount: number }> {
  const templateId = pickTemplate(request.templateId, templates, fallbackTemplateId);
  let lines: PrintLine[];

  if (request.lines?.length) {
    if (request.lines.length > MAX_IDS) throw new PrintJobError(`${MAX_IDS} lignes au maximum`);
    for (const l of request.lines) checkQuantity(l.quantity);
    lines = request.lines.map((l) => ({ variantId: String(l.variantId), quantity: l.quantity }));
  } else {
    const ids = request.ids ?? [];
    if (!ids.length) throw new PrintJobError("Aucun produit sélectionné");
    if (ids.length > MAX_IDS) throw new PrintJobError(`${MAX_IDS} produits au maximum`);
    const variantIds = await expandToVariantIds(gql, ids);
    const quantity = request.quantity ?? 1;
    if (quantity === "stock") {
      const variants = await fetchVariantsForLabels(gql, variantIds);
      const stock = new Map(variants.map((v) => [v.variantId, v.inventoryQuantity]));
      lines = variantIds.map((variantId) => ({
        variantId,
        quantity: Math.max(0, Math.min(stock.get(variantId) ?? 0, MAX_PER_LINE)),
      }));
    } else {
      checkQuantity(quantity);
      lines = variantIds.map((variantId) => ({ variantId, quantity }));
    }
  }

  lines = lines.filter((l) => l.quantity > 0);
  const labelCount = lines.reduce((sum, l) => sum + l.quantity, 0);
  if (!labelCount) throw new PrintJobError("Aucune étiquette à imprimer : toutes les quantités sont à 0.");
  if (labelCount > MAX_PER_JOB) throw new PrintJobError(`${MAX_PER_JOB} étiquettes au maximum par impression`);
  return { lines, templateId, labelCount };
}

// Rend le PDF d'une impression enregistrée, au moment où le lien est ouvert
export async function renderLinkedJob(args: {
  gql: Gql;
  job: { templateId: string; itemsJson: string };
  templates: ResolvedTemplate[];
  settings: PrintSettings;
}): Promise<{ pdf: Uint8Array; warnings: string[]; variants: LabelVariant[] }> {
  const lines = JSON.parse(args.job.itemsJson) as PrintLine[];
  const { groups, variants } = await renderPrintGroups({
    gql: args.gql,
    lines,
    templates: args.templates,
    templateId: args.job.templateId,
    fallbackTemplateId: args.job.templateId,
    settings: args.settings,
  });
  const group = groups[0];
  if (!group) throw new PrintJobError("Ces produits n'existent plus");
  return { pdf: group.pdf, warnings: group.warnings, variants };
}

// La caisse passe ses lignes dans l'adresse : « 123:2,456:1 » (id de variante : quantité)
export function parseLinesParam(param: string | null): PrintLine[] {
  if (!param) throw new PrintJobError("Aucune étiquette demandée");
  return param.split(",").map((part) => {
    const match = /^(\d{1,20}):(\d{1,4})$/.exec(part.trim());
    if (!match) throw new PrintJobError("Demande d'impression illisible");
    return { variantId: `gid://shopify/ProductVariant/${match[1]}`, quantity: Number(match[2]) };
  });
}
