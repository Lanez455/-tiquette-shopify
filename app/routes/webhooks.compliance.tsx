import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";

// L'app ne stocke aucune donnée client : seules les données de boutique sont effacées.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") {
    await prisma.$transaction([
      prisma.printJob.deleteMany({ where: { shop } }),
      prisma.labelTemplate.deleteMany({ where: { shop } }),
      prisma.barcodeChange.deleteMany({ where: { shop } }),
      prisma.barcodeCounter.deleteMany({ where: { shop } }),
      prisma.shopSettings.deleteMany({ where: { shop } }),
      prisma.session.deleteMany({ where: { shop } }),
    ]);
  }
  return new Response();
};
