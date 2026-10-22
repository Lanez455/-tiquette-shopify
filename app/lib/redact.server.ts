import type { PrismaClient } from "@prisma/client";

// Tables qui contiennent des données d'une boutique. Le test vérifie que
// chaque modèle du schéma avec un champ `shop` figure ici.
export const SHOP_TABLES = [
  "printJob",
  "labelTemplate",
  "barcodeChange",
  "barcodeCounter",
  "printedPrice",
  "shopSettings",
  "session",
] as const;

// Webhook shop/redact : 48 h après la désinstallation, tout est effacé
export async function redactShop(db: PrismaClient, shop: string): Promise<void> {
  await db.$transaction(
    SHOP_TABLES.map((table) => (db[table] as unknown as { deleteMany: (args: object) => Promise<unknown> }).deleteMany({ where: { shop } })) as never,
  );
}
