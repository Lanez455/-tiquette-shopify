import { execSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { redactShop, SHOP_TABLES } from "./redact.server";

const dir = mkdtempSync(join(tmpdir(), "redact-"));
const url = `file:${join(dir, "test.sqlite")}`;
let db: PrismaClient;

beforeAll(() => {
  // Vraie base SQLite, créée par les migrations du dépôt
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  db = new PrismaClient({ datasourceUrl: url });
});

afterAll(async () => {
  await db?.$disconnect();
  rmSync(dir, { recursive: true, force: true });
});

describe("effacement d'une boutique (shop/redact)", () => {
  it("couvre chaque modèle qui a un champ shop", () => {
    const withShop = Prisma.dmmf.datamodel.models
      .filter((m) => m.fields.some((f) => f.name === "shop"))
      .map((m) => m.name.charAt(0).toLowerCase() + m.name.slice(1));
    expect([...SHOP_TABLES].sort()).toEqual(withShop.sort());
  });

  it("efface toutes les données de la boutique et seulement elles", async () => {
    for (const shop of ["a.myshopify.com", "b.myshopify.com"]) {
      await db.session.create({ data: { id: `s-${shop}`, shop, state: "x", accessToken: "t" } });
      await db.shopSettings.create({ data: { shop } });
      await db.printedPrice.create({ data: { shop, variantId: "gid://shopify/ProductVariant/1", price: "10.00" } });
      await db.barcodeCounter.create({ data: { shop } });
      await db.barcodeChange.create({ data: { shop, variantId: "v", newValue: "1", reason: "generated", batchId: "b" } });
    }
    await redactShop(db, "a.myshopify.com");
    for (const table of SHOP_TABLES) {
      const model = db[table] as unknown as { count: (args: object) => Promise<number> };
      expect(await model.count({ where: { shop: "a.myshopify.com" } }), table).toBe(0);
    }
    expect(await db.printedPrice.count({ where: { shop: "b.myshopify.com" } })).toBe(1);
    expect(await db.session.count({ where: { shop: "b.myshopify.com" } })).toBe(1);
  });
});
