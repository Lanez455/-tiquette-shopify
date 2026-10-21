import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { printContext } from "../lib/print/context.server";
import { PrintJobError } from "../lib/print/job";
import { appSecret, pdfResponse, textResponse as text } from "../lib/print/linkRoutes.server";
import { renderLinkedJob } from "../lib/print/links.server";
import { InvalidLinkError, verifyPrintLink } from "../lib/print/signedLink";
import { gqlFromAdmin } from "../lib/shopify/graphql";

// PDF ouvert par le bouton Imprimer de l'admin (F15).
// Aucune session ici : seule la signature du lien fait foi.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  let payload;
  try {
    payload = verifyPrintLink(new URL(request.url).searchParams, appSecret());
  } catch (error) {
    if (error instanceof InvalidLinkError || error instanceof SyntaxError) return text(error.message, 403);
    throw error;
  }

  const job = await prisma.printJob.findFirst({ where: { id: payload.jobId, shop: payload.shop } });
  if (!job) return text("Impression introuvable", 404);

  try {
    const { admin } = await unauthenticated.admin(payload.shop);
    const gql = gqlFromAdmin(admin);
    const { printSettings } = await printContext(gql, payload.shop);
    const { pdf } = await renderLinkedJob({ gql, job, templates: await listTemplates(payload.shop), settings: printSettings });
    return pdfResponse(pdf, job.id);
  } catch (error) {
    if (error instanceof PrintJobError) return text(error.message, 400);
    throw error;
  }
};
