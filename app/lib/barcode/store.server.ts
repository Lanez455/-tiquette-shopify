import prisma from "../../db.server";
import type { BarcodeStore } from "./service";

export const prismaBarcodeStore: BarcodeStore = {
  async getCounter(shop) {
    const row = await prisma.barcodeCounter.upsert({ where: { shop }, create: { shop }, update: {} });
    return row.nextValue;
  },
  async compareAndSetCounter(shop, expected, next) {
    const { count } = await prisma.barcodeCounter.updateMany({
      where: { shop, nextValue: expected },
      data: { nextValue: next },
    });
    return count === 1;
  },
  async appendJournal(shop, batchId, reason, changes) {
    await prisma.barcodeChange.createMany({
      data: changes.map((c) => ({ shop, batchId, reason, variantId: c.variantId, oldValue: c.oldValue, newValue: c.newValue })),
    });
  },
  async readJournal(shop, batchId) {
    const rows = await prisma.barcodeChange.findMany({ where: { shop, batchId }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ variantId: r.variantId, oldValue: r.oldValue, newValue: r.newValue }));
  },
};
