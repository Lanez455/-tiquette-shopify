import type { LoaderFunctionArgs } from "react-router";
import prisma from "../db.server";
import { unauthenticated } from "../shopify.server";
import { listTemplates } from "../lib/labels/templates.server";
import { printContext } from "../lib/print/context.server";
import { PrintJobError } from "../lib/print/job";
import { appSecret, pdfResponse, textResponse as text } from "../lib/print/linkRoutes.server";
import { recordPrintedPrices } from "../lib/print/promo.server";
import { renderLinkedJob } from "../lib/print/links.server";
import { InvalidLinkError, verifyPrintLink } from "../lib/print/signedLink";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { langFromRequest, translate } from "../lib/i18n";

// L'admin télécharge le PDF depuis son propre domaine : le navigateur vérifie
// d'abord (requête OPTIONS) que l'app l'autorise. Le lien signé suffit à
// protéger le document, sans cookie, donc toutes les origines sont acceptées.
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "600",
};

function withCors(response: Response) {
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}

// PDF ouvert par le bouton Imprimer de l'admin (F15).
// Aucune session ici : seule la signature du lien fait foi.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Sans cette réponse, la vérification préalable lançait tout le rendu du PDF
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  return withCors(await renderDoc(request));
};

async function renderDoc(request: Request) {
  const tr = (message: string) => translate(langFromRequest(request), message);
  let payload;
  try {
    payload = verifyPrintLink(new URL(request.url).searchParams, appSecret());
  } catch (error) {
    if (error instanceof InvalidLinkError || error instanceof SyntaxError) return text(tr(error.message), 403);
    throw error;
  }

  const job = await prisma.printJob.findFirst({ where: { id: payload.jobId, shop: payload.shop } });
  if (!job) return text(tr("Impression introuvable"), 404);

  try {
    const { admin } = await unauthenticated.admin(payload.shop);
    const gql = gqlFromAdmin(admin);
    const { printSettings } = await printContext(gql, payload.shop);
    const { pdf, variants } = await renderLinkedJob({ gql, job, templates: await listTemplates(payload.shop), settings: printSettings });
    await recordPrintedPrices(payload.shop, variants);
    return pdfResponse(pdf, job.id);
  } catch (error) {
    if (error instanceof PrintJobError) return text(tr(error.message), 400);
    throw error;
  }
}
