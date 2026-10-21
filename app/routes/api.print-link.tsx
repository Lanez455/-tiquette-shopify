import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createLinkResponse, linkOptions } from "../lib/print/linkRoutes.server";
import { gqlFromAdmin } from "../lib/shopify/graphql";

// Bouton Imprimer de l'admin (F15). L'extension appelle cette adresse avec
// son jeton Shopify, ajouté automatiquement par fetch().

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  return cors(Response.json(await linkOptions(gqlFromAdmin(admin), session.shop)));
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session, cors } = await authenticate.admin(request);
  const result = await createLinkResponse(gqlFromAdmin(admin), session.shop, await request.json());
  return cors(Response.json(result, { status: "error" in result ? 400 : 200 }));
};
