import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { gqlFromAdmin, ShopifyUserError } from "../lib/shopify/graphql";
import { adjustStock, findScannedVariant, ScanError } from "../lib/shopify/receiving";
import { currentPlan, PlanLimitError, requireFeature } from "../lib/billing/plans";

export type ScanResult =
  | { ok: true; key: string; variantId: string; inventoryItemId: string; name: string; stock: number; delta: 1 | -1 }
  | { ok: false; key: string; error: string };

// Un scan = +1 en stock ; « annuler » = −1 sur le dernier article
export const action = async ({ request }: ActionFunctionArgs): Promise<Response> => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const form = await request.formData();
  const key = String(form.get("key") ?? "");
  const locationId = String(form.get("locationId") ?? "");
  try {
    requireFeature(await currentPlan(gql, session.shop), "receiving");
    if (form.get("intent") === "undo") {
      const inventoryItemId = String(form.get("inventoryItemId") ?? "");
      const stock = await adjustStock(gql, { inventoryItemId, locationId, delta: -1, idempotencyKey: key });
      return Response.json({ ok: true, key, variantId: String(form.get("variantId")), inventoryItemId, name: String(form.get("name")), stock, delta: -1 } satisfies ScanResult);
    }
    const variant = await findScannedVariant(gql, String(form.get("code") ?? ""));
    const stock = await adjustStock(gql, { inventoryItemId: variant.inventoryItemId, locationId, delta: 1, idempotencyKey: key });
    return Response.json({ ok: true, key, variantId: variant.variantId, inventoryItemId: variant.inventoryItemId, name: variant.name, stock, delta: 1 } satisfies ScanResult);
  } catch (error) {
    if (error instanceof ScanError || error instanceof ShopifyUserError || error instanceof PlanLimitError) return Response.json({ ok: false, key, error: error.message } satisfies ScanResult);
    throw error;
  }
};

