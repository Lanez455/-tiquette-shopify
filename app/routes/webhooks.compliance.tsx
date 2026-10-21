import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { redactShop } from "../lib/redact.server";

// L'app ne stocke aucune donnée client : seules les données de boutique sont effacées.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await redactShop(prisma, shop);
  }
  return new Response();
};
