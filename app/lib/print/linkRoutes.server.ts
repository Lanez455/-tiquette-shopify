import prisma from "../../db.server";
import { listTemplates } from "../labels/templates.server";
import type { Gql } from "../shopify/graphql";
import { printContext } from "./context.server";
import { PrintJobError } from "./job";
import { LINK_SOURCES, planLinkedJob, renderLinkedJob, type LinkRequest } from "./links.server";
import { recordPrintedPrices } from "./promo.server";
import { createPrintLink } from "./signedLink";
import { PlanLimitError } from "../billing/plans";
import { enforcePrint } from "../billing/usage.server";

export const appSecret = () => process.env.SHOPIFY_API_SECRET ?? "";

// Modèles proposés dans le bouton Imprimer de l'admin
export async function linkOptions(gql: Gql, shop: string) {
  const [templates, { fallbackTemplateId }] = await Promise.all([listTemplates(shop), printContext(gql, shop)]);
  return {
    defaultTemplateId: fallbackTemplateId,
    templates: templates.map((t) => ({ id: t.id, name: t.name })),
  };
}

// Vérifie la demande et l'enregistre dans l'historique (réimpression possible)
async function recordJob(gql: Gql, shop: string, body: LinkRequest, source: string) {
  const [templates, { fallbackTemplateId }] = await Promise.all([listTemplates(shop), printContext(gql, shop)]);
  const plan = await planLinkedJob(gql, body, templates, fallbackTemplateId);
  await enforcePrint(gql, shop, { source, labels: plan.labelCount });
  const job = await prisma.printJob.create({
    data: {
      shop,
      templateId: plan.templateId,
      source: LINK_SOURCES.has(source) ? source : "product",
      itemsJson: JSON.stringify(plan.lines),
      labelCount: plan.labelCount,
    },
  });
  return { job, plan, templates };
}

// Admin : renvoie l'adresse signée du PDF, que Shopify affiche puis imprime
export async function createLinkResponse(gql: Gql, shop: string, body: LinkRequest) {
  try {
    const { job, plan } = await recordJob(gql, shop, body, "product");
    const query = createPrintLink({ shop, jobId: job.id }, appSecret());
    const base = (process.env.SHOPIFY_APP_URL ?? "").replace(/\/$/, "");
    return { url: `${base}/print/doc?${query}`, labelCount: plan.labelCount };
  } catch (error) {
    if (error instanceof PrintJobError || error instanceof PlanLimitError) return { error: error.message };
    throw error;
  }
}

export const pdfResponse = (pdf: Uint8Array, name: string) =>
  new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="etiquettes-${name}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });

export const textResponse = (message: string, status: number) =>
  new Response(message, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });

// Caisse : la demande et le rendu se font dans le même appel
export async function renderDirect(gql: Gql, shop: string, body: LinkRequest, source: string): Promise<Response> {
  try {
    const { job, templates } = await recordJob(gql, shop, body, source);
    const { printSettings } = await printContext(gql, shop);
    const { pdf, variants } = await renderLinkedJob({ gql, job, templates, settings: printSettings });
    await recordPrintedPrices(shop, variants);
    return pdfResponse(pdf, job.id);
  } catch (error) {
    if (error instanceof PrintJobError) return textResponse(error.message, 400);
    if (error instanceof PlanLimitError) return textResponse(error.message, 402);
    throw error;
  }
}
