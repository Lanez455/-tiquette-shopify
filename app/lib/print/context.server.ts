import { getSettings } from "../settings.server";
import { fetchShopFormat } from "../shopify/catalog";
import type { Gql } from "../shopify/graphql";
import type { PrintSettings } from "./render";

export const DEFAULT_TEMPLATE = "builtin:dymo-30336";

export async function printContext(gql: Gql, shop: string) {
  const [settings, shopFormat] = await Promise.all([getSettings(shop), fetchShopFormat(gql)]);
  const symbolPosition = settings.currencySymbol === "before" || settings.currencySymbol === "after" ? settings.currencySymbol : "auto";
  const printSettings: PrintSettings = {
    offsetXmm: settings.offsetXmm,
    offsetYmm: settings.offsetYmm,
    rotate90: settings.rotate90,
    printerDpi: settings.printerDpi,
    price: { currency: shopFormat.currency, locale: shopFormat.locale, symbolPosition },
  };
  return { settings, printSettings, fallbackTemplateId: settings.defaultTemplateId ?? DEFAULT_TEMPLATE };
}
