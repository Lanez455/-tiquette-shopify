import prisma from "../db.server";
import type { Symbology } from "./barcode/generate";

export type DefaultQuantity = "zero" | "one" | "stock";

export async function getSettings(shop: string) {
  return prisma.shopSettings.upsert({ where: { shop }, create: { shop }, update: {} });
}

export const symbologyOf = (value: string): Symbology =>
  value === "upca" || value === "code128" ? value : "ean13";
