import type { LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { renderDirect, textResponse } from "../lib/print/linkRoutes.server";
import { PrintJobError } from "../lib/print/job";
import { parseLinesParam } from "../lib/print/links.server";
import { gqlFromAdmin } from "../lib/shopify/graphql";

// Étiquettes imprimées depuis la caisse (F15). La caisse charge cette adresse
// avec son jeton de session ; le modèle est celui par défaut de la boutique.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { sessionToken, cors } = await authenticate.pos(request);
  const shop = new URL(sessionToken.dest).hostname;
  let lines;
  try {
    lines = parseLinesParam(new URL(request.url).searchParams.get("l"));
  } catch (error) {
    if (error instanceof PrintJobError) return cors(textResponse(error.message, 400));
    throw error;
  }
  const { admin } = await unauthenticated.admin(shop);
  return cors(await renderDirect(gqlFromAdmin(admin), shop, { lines }, "pos"));
};
