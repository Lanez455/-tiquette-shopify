import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { findDuplicates, ConfirmationRequiredError, replaceConfirmationPhrase } from "../lib/barcode/plan";
import { generateBarcodes, rollbackBatch } from "../lib/barcode/service";
import { prismaBarcodeStore } from "../lib/barcode/store.server";
import { fetchCatalogBarcodes } from "../lib/shopify/catalog";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { getSettings, symbologyOf } from "../lib/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const catalog = await fetchCatalogBarcodes(gqlFromAdmin(admin));
  const duplicates = findDuplicates(catalog);
  const batches = await prisma.barcodeChange.groupBy({
    by: ["batchId", "reason"],
    where: { shop: session.shop },
    _count: { _all: true },
    _max: { createdAt: true },
    orderBy: { _max: { createdAt: "desc" } },
    take: 20,
  });
  return {
    total: catalog.length,
    missing: catalog.filter((v) => !v.barcode?.trim()).length,
    withCode: catalog.filter((v) => v.barcode?.trim()).length,
    duplicates: [...duplicates].map(([code, variantIds]) => ({ code, variantIds })),
    batches: batches.map((b) => ({
      batchId: b.batchId,
      reason: b.reason,
      count: b._count._all,
      date: b._max.createdAt?.toISOString() ?? "",
    })),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const form = await request.formData();
  const intent = form.get("intent");
  const settings = await getSettings(session.shop);
  const symbology = symbologyOf(settings.barcodeSymbology);

  if (intent === "rollback") {
    const result = await rollbackBatch(gql, prismaBarcodeStore, session.shop, String(form.get("batchId")));
    return { message: `${result.restored} codes restaurés${result.skipped ? `, ${result.skipped} laissés car modifiés depuis` : ""}.` };
  }

  const catalog = await fetchCatalogBarcodes(gql);
  if (intent === "generate-missing") {
    const ids = catalog.filter((v) => !v.barcode?.trim()).map((v) => v.variantId);
    const result = await generateBarcodes(gql, prismaBarcodeStore, session.shop, ids, symbology);
    return { message: `${result.written.length} codes créés. Aucun code existant n'a été modifié.` };
  }

  if (intent === "replace-all") {
    try {
      const result = await generateBarcodes(
        gql, prismaBarcodeStore, session.shop, catalog.map((v) => v.variantId), symbology,
        { kind: "replace", confirmation: String(form.get("confirmation") ?? "") },
      );
      return { message: `${result.written.length} codes remplacés. Ce lot peut être annulé ci-dessous.` };
    } catch (error) {
      if (error instanceof ConfirmationRequiredError) return { error: error.message };
      throw error;
    }
  }
  return { error: "Action inconnue" };
};

const REASONS: Record<string, string> = {
  generated: "Création",
  replace_confirmed: "Remplacement confirmé",
  gtin_import: "Import GS1",
  rollback: "Annulation",
};

export default function Barcodes() {
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";

  return (
    <s-page heading="Codes-barres">
      {result && "message" in result && <s-banner tone="success">{result.message}</s-banner>}
      {result && "error" in result && <s-banner tone="critical">{result.error}</s-banner>}

      <s-section heading="Couverture du catalogue">
        <s-paragraph>
          {data.withCode} variantes sur {data.total} ont un code-barres. {data.missing} n'en ont pas.
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="generate-missing" />
          <s-button type="submit" variant="primary" disabled={busy || data.missing === 0}>
            Créer les {data.missing} codes manquants
          </s-button>
        </Form>
      </s-section>

      <s-section heading="Doublons">
        {data.duplicates.length === 0 ? (
          <s-paragraph>Aucun doublon dans le catalogue.</s-paragraph>
        ) : (
          <s-unordered-list>
            {data.duplicates.map((d) => (
              <s-list-item key={d.code}>
                {d.code} : {d.variantIds.length} variantes
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>

      <s-section heading="Remplacer tous les codes">
        <s-paragraph>
          Remplace aussi les codes existants, y compris ceux des fabricants. Les étiquettes déjà collées ne
          scanneront plus. Pour confirmer, tapez « {replaceConfirmationPhrase(data.withCode)} ».
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="replace-all" />
          <s-text-field name="confirmation" label="Confirmation" autocomplete="off"></s-text-field>
          <s-button type="submit" tone="critical" disabled={busy}>
            Remplacer tous les codes
          </s-button>
        </Form>
      </s-section>

      <s-section heading="Journal des changements">
        {data.batches.length === 0 ? (
          <s-paragraph>Aucun changement pour l'instant.</s-paragraph>
        ) : (
          <s-unordered-list>
            {data.batches.map((b) => (
              <s-list-item key={b.batchId}>
                {new Date(b.date).toLocaleString("fr-FR")} · {REASONS[b.reason] ?? b.reason} · {b.count} codes
                {b.reason !== "rollback" && (
                  <Form method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="intent" value="rollback" />
                    <input type="hidden" name="batchId" value={b.batchId} />
                    <s-button type="submit" variant="tertiary" disabled={busy}>
                      Annuler ce lot
                    </s-button>
                  </Form>
                )}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}
