import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { fetchCurrentPrices, findPriceChanges, setCompareAtPrices } from "../lib/print/promo";
import { formatPrice } from "../lib/labels/price";
import { fetchShopFormat } from "../lib/shopify/catalog";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { useT } from "../lib/i18n/react";

// Réétiquetage des promotions (F21)
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const printed = await prisma.printedPrice.findMany({ where: { shop: session.shop }, orderBy: { printedAt: "desc" }, take: 5000 });
  const [current, format] = await Promise.all([fetchCurrentPrices(gql, printed.map((p) => p.variantId)), fetchShopFormat(gql)]);
  const money = (v: string | null) => (v ? formatPrice(v, { currency: format.currency, locale: format.locale }) : "");
  return {
    tracked: printed.length,
    changes: findPriceChanges(printed, current).map((c) => ({
      variantId: c.variantId,
      name: c.name,
      before: money(c.printedPrice),
      now: money(c.price),
      compareAt: money(c.compareAtPrice),
      suggested: c.suggestedCompareAt,
      suggestedLabel: money(c.suggestedCompareAt),
      printedAt: c.printedAt.toISOString(),
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, redirect } = await authenticate.admin(request);
  const form = await request.formData();
  const ids = form.getAll("variantId").map(String).filter((id) => id.startsWith("gid://shopify/ProductVariant/"));
  if (!ids.length) return { error: "Cochez au moins un article." };
  // Prix barré : seulement pour les baisses cochées, avec l'ancien prix imprimé
  const strike = form.getAll("strike").map(String);
  const updates = strike.flatMap((entry) => {
    const [variantId, compareAtPrice] = entry.split("|");
    return variantId && ids.includes(variantId) && /^\d+(\.\d+)?$/.test(compareAtPrice ?? "") ? [{ variantId, compareAtPrice: compareAtPrice! }] : [];
  });
  try {
    await setCompareAtPrices(gqlFromAdmin(admin), updates);
  } catch (error) {
    return { error: `Prix barrés non enregistrés : ${error instanceof Error ? error.message : "erreur"}` };
  }
  return redirect(`/app/print?ids=${encodeURIComponent(ids.slice(0, 250).join(","))}&source=promo`);
};

export default function Promos() {
  const t = useT();
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";

  return (
    <s-page heading={t("Prix changés")}>
      {result && "error" in result && <s-banner tone="critical">{t(result.error)}</s-banner>}
      <s-section>
        <s-paragraph>
          {t(
            "Articles dont le prix a changé depuis leur dernière étiquette ({n} articles suivis). Cochez ceux à réétiqueter : ils passent dans l'écran Impression.",
            { n: data.tracked },
          )}
        </s-paragraph>
      </s-section>
      <s-section heading={t("{n} étiquette(s) à refaire", { n: data.changes.length })}>
        {data.changes.length === 0 ? (
          <s-paragraph>{t("Aucun prix n'a changé depuis les dernières impressions.")}</s-paragraph>
        ) : (
          <Form method="post">
            <s-table>
              <s-table-header-row>
                <s-table-header>{t("Réétiqueter")}</s-table-header>
                <s-table-header>{t("Article")}</s-table-header>
                <s-table-header>{t("Prix imprimé")}</s-table-header>
                <s-table-header>{t("Prix actuel")}</s-table-header>
                <s-table-header>{t("Prix barré")}</s-table-header>
              </s-table-header-row>
              <s-table-body>
                {data.changes.map((c) => (
                  <s-table-row key={c.variantId}>
                    <s-table-cell>
                      <s-checkbox name="variantId" value={c.variantId} defaultChecked label={t("Réétiqueter")} labelAccessibilityVisibility="exclusive" />
                    </s-table-cell>
                    <s-table-cell>{c.name}</s-table-cell>
                    <s-table-cell>{c.before}</s-table-cell>
                    <s-table-cell>{c.now}</s-table-cell>
                    <s-table-cell>
                      {c.suggested ? (
                        <s-checkbox name="strike" value={`${c.variantId}|${c.suggested}`} label={t("Barrer {price}", { price: c.suggestedLabel })} />
                      ) : (
                        c.compareAt
                      )}
                    </s-table-cell>
                  </s-table-row>
                ))}
              </s-table-body>
            </s-table>
            <s-button type="submit" variant="primary" disabled={busy}>{t("Imprimer les étiquettes cochées")}</s-button>
          </Form>
        )}
      </s-section>
    </s-page>
  );
}
