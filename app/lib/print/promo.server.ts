import prisma from "../../db.server";
import type { LabelVariant } from "../shopify/catalog";

// Retient le prix de chaque variante au moment où son étiquette part (F21)
export async function recordPrintedPrices(shop: string, variants: Pick<LabelVariant, "variantId" | "price" | "compareAtPrice">[]) {
  const unique = new Map(variants.map((v) => [v.variantId, v]));
  await prisma.$transaction(
    [...unique.values()].map((v) =>
      prisma.printedPrice.upsert({
        where: { shop_variantId: { shop, variantId: v.variantId } },
        create: { shop, variantId: v.variantId, price: v.price ?? null, compareAtPrice: v.compareAtPrice ?? null },
        update: { price: v.price ?? null, compareAtPrice: v.compareAtPrice ?? null, printedAt: new Date() },
      }),
    ),
  );
}
