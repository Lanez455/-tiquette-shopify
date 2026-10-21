import type { ActionFunctionArgs } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { PrintJobError, type PrintLine } from "../lib/print/job";
import { printContext } from "../lib/print/context.server";
import { renderPrintGroups } from "../lib/print/render.server";
import { gqlFromAdmin } from "../lib/shopify/graphql";

interface PrintRequest {
  lines?: PrintLine[];
  templateId?: string;
  start?: { row: number; column: number };
  source?: string;
  preview?: boolean;
  // Réimpression d'une impression passée (F16)
  reprintJobId?: string;
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
    const { groups } = await renderPrintGroups({
      gql,
      lines,
      templates: await listTemplates(session.shop),
      templateId,
      fallbackTemplateId,
      settings: printSettings,
      start: body.start,
      preview: body.preview,
    });
    if (!body.preview) {
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
