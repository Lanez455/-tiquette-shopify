import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { PrintJobError, type PrintLine } from "../lib/print/job";
import { printContext } from "../lib/print/context.server";
import { renderPrintGroups } from "../lib/print/render.server";
import { toDirect, type DirectOutput } from "../lib/print/direct.server";
import { recordPrintedPrices } from "../lib/print/promo.server";
import { gqlFromAdmin } from "../lib/shopify/graphql";

interface PrintRequest {
  lines?: PrintLine[];
  templateId?: string;
  start?: { row: number; column: number };
  source?: string;
  preview?: boolean;
  // Réimpression d'une impression passée (F16)
  reprintJobId?: string;
  // Impression directe (F17) : ZPL pour Zebra, fichiers d'étiquette pour Dymo
  output?: "pdf" | DirectOutput;
  // Repli sur le PDF après l'échec d'une impression directe : déjà dans l'historique
  fallback?: boolean;
}

const SOURCES = new Set(["product", "purchase_order", "transfer", "csv", "pos", "receiving", "promo"]);

// Renvoie les PDF à imprimer, un par modèle, encodés en base64
export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const body = (await request.json()) as PrintRequest;

  let lines = body.lines ?? [];
  let templateId = body.templateId ?? "auto";
  let source = SOURCES.has(body.source ?? "") ? body.source! : "product";
  if (body.reprintJobId) {
    const job = await prisma.printJob.findFirst({ where: { id: body.reprintJobId, shop: session.shop } });
    if (!job) return Response.json({ error: "Impression introuvable" }, { status: 404 });
    lines = JSON.parse(job.itemsJson) as PrintLine[];
    templateId = job.templateId;
    source = job.source;
  }

  try {
    const { printSettings, fallbackTemplateId } = await printContext(gql, session.shop);
    const output = body.output === "zpl" || body.output === "dymo" ? body.output : "pdf";
    // Les Dymo LabelWriter impriment à 300 ppp : les barres sont calées dessus
    if (output === "dymo") printSettings.printerDpi = 300;
    const templates = await listTemplates(session.shop);
    const { groups, variants } = await renderPrintGroups({
      gql,
      lines,
      templates,
      templateId,
      fallbackTemplateId,
      settings: printSettings,
      start: body.start,
      preview: body.preview,
    });
    // Conversion avant l'enregistrement : une planche refusée n'entre pas dans l'historique
    const direct = output === "pdf" ? null : await toDirect(groups, templates, output, printSettings.printerDpi);
    if (!body.preview) {
      const printed = new Set(lines.filter((l) => l.quantity > 0).map((l) => l.variantId));
      await recordPrintedPrices(session.shop, variants.filter((v) => printed.has(v.variantId)));
    }
    if (!body.preview && !body.fallback) {
      await prisma.printJob.create({
        data: {
          shop: session.shop,
          templateId,
          source,
          itemsJson: JSON.stringify(lines.filter((l) => l.quantity > 0)),
          labelCount: groups.reduce((sum, g) => sum + g.labelCount, 0),
        },
      });
    }
    if (direct) return Response.json({ direct });
    return Response.json({
      groups: groups.map((g) => ({
        templateName: g.templateName,
        labelCount: g.labelCount,
        warnings: g.warnings,
        pdfBase64: Buffer.from(g.pdf).toString("base64"),
      })),
    });
  } catch (error) {
    if (error instanceof PrintJobError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
};
