import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { findDuplicates, ConfirmationRequiredError, replaceConfirmationPhrase } from "../lib/barcode/plan";
import { generateBarcodes, importGs1, rollbackBatch } from "../lib/barcode/service";
import { parseGs1Input } from "../lib/barcode/gs1";
import { prismaBarcodeStore } from "../lib/barcode/store.server";
import { fetchCatalogBarcodes } from "../lib/shopify/catalog";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { getSettings, symbologyOf } from "../lib/settings.server";
import { pickLang, translate, dateLocale, type Vars } from "../lib/i18n";
import { useLang, useT } from "../lib/i18n/react";

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
  // Messages composés ici : traduits dans la langue de l'écran qui a envoyé le formulaire
  const lang = pickLang(String(form.get("lang") ?? "")) ?? "fr";
  const tr = (text: string, vars?: Vars) => translate(lang, text, vars);
  const lineError = (e: { line: number; message: string }) => tr("ligne {line} : {message}", { line: e.line, message: tr(e.message) });

  if (intent === "rollback") {
    const result = await rollbackBatch(gql, prismaBarcodeStore, session.shop, String(form.get("batchId")));
    return {
      message: result.skipped
        ? tr("{restored} codes restaurés, {skipped} laissés car modifiés depuis.", { restored: result.restored, skipped: result.skipped })
        : tr("{restored} codes restaurés.", { restored: result.restored }),
    };
  }

  if (intent === "gs1-import") {
    const { rows, errors } = parseGs1Input(String(form.get("gtins") ?? ""));
    if (!rows.length) return { error: errors.map(lineError).slice(0, 10).join(" ; ") || tr("Aucun GTIN valide") };
    try {
      const result = await importGs1(gql, prismaBarcodeStore, session.shop, rows, String(form.get("confirmation") ?? "") || undefined);
      const issues = [...errors, ...result.problems].sort((a, b) => a.line - b.line);
      const parts = [tr("{n} GTIN attribués.", { n: result.assignments.length })];
      if (result.unused.length) parts.push(tr("{n} GTIN libres non utilisés (plus de variante sans code) : gardez-les pour vos prochains produits.", { n: result.unused.length }));
      if (issues.length) parts.push(`${tr("{n} ligne(s) refusée(s) :", { n: issues.length })} ${issues.slice(0, 10).map(lineError).join(" ; ")}${issues.length > 10 ? " ; …" : ""}`);
      return issues.length ? { warning: parts.join(" ") } : { message: parts.join(" ") };
    } catch (error) {
      if (error instanceof ConfirmationRequiredError) {
        return { error: tr("{error} : certaines variantes ont déjà un code, il sera remplacé.", { error: tr(error.message) }), needsConfirmation: true };
      }
      throw error;
    }
  }

  const catalog = await fetchCatalogBarcodes(gql);
  if (intent === "generate-missing") {
    const ids = catalog.filter((v) => !v.barcode?.trim()).map((v) => v.variantId);
    const result = await generateBarcodes(gql, prismaBarcodeStore, session.shop, ids, symbology);
    return { message: tr("{n} codes créés. Aucun code existant n'a été modifié.", { n: result.written.length }) };
  }

  if (intent === "replace-all") {
    try {
      const result = await generateBarcodes(
        gql, prismaBarcodeStore, session.shop, catalog.map((v) => v.variantId), symbology,
        { kind: "replace", confirmation: String(form.get("confirmation") ?? "") },
      );
      return { message: tr("{n} codes remplacés. Ce lot peut être annulé ci-dessous.", { n: result.written.length }) };
    } catch (error) {
      if (error instanceof ConfirmationRequiredError) return { error: tr(error.message) };
      throw error;
    }
  }
  return { error: tr("Action inconnue") };
};

const REASONS: Record<string, string> = {
  generated: "Création",
  replace_confirmed: "Remplacement confirmé",
  gtin_import: "Import GS1",
  rollback: "Annulation",
};

export default function Barcodes() {
  const t = useT();
  const lang = useLang();
  const data = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";

  return (
    <s-page heading={t("Codes-barres")}>
      {result && "message" in result && <s-banner tone="success">{t(result.message)}</s-banner>}
      {result && "error" in result && <s-banner tone="critical">{t(result.error)}</s-banner>}
      {result && "warning" in result && <s-banner tone="warning">{t(result.warning)}</s-banner>}

      <s-section heading={t("Couverture du catalogue")}>
        <s-paragraph>
          {t("{withCode} variantes sur {total} ont un code-barres. {missing} n'en ont pas.", { withCode: data.withCode, total: data.total, missing: data.missing })}
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="generate-missing" />
          <input type="hidden" name="lang" value={lang} />
          <s-button type="submit" variant="primary" disabled={busy || data.missing === 0}>
            {t("Créer les {n} codes manquants", { n: data.missing })}
          </s-button>
        </Form>
      </s-section>

      <s-section heading={t("Doublons")}>
        {data.duplicates.length === 0 ? (
          <s-paragraph>{t("Aucun doublon dans le catalogue.")}</s-paragraph>
        ) : (
          <s-unordered-list>
            {data.duplicates.map((d) => (
              <s-list-item key={d.code}>
                {t("{code} : {n} variantes", { code: d.code, n: d.variantIds.length })}
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>

      <s-section heading={t("Importer mes GTIN GS1")}>
        <s-paragraph>
          {t(
            "Pour vendre sur Google Shopping ou chez un revendeur, il faut des GTIN achetés auprès de GS1 : l'app n'en crée jamais. Collez-les ou importez le fichier : une colonne « GTIN », et si vous voulez choisir la variante, une colonne « SKU ». Sans SKU, chaque GTIN va à une variante qui n'a pas encore de code. Chaque clé de contrôle est vérifiée.",
          )}
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="gs1-import" />
          <input type="hidden" name="lang" value={lang} />
          <s-text-area name="gtins" label={t("GTIN (un par ligne, ou « SKU;GTIN »)")} rows={6}></s-text-area>
          <input
            type="file"
            accept=".csv,.txt,text/csv"
            onChange={async (e) => {
              const file = e.currentTarget.files?.[0];
              const area = e.currentTarget.form?.querySelector<HTMLElement & { value: string }>("s-text-area");
              if (file && area && file.size < 2_000_000) area.value = await file.text();
            }}
          />
          {result && "needsConfirmation" in result && (
            <s-text-field name="confirmation" label={t("Confirmation du remplacement")} autocomplete="off"></s-text-field>
          )}
          <s-button type="submit" disabled={busy}>{t("Importer et attribuer")}</s-button>
        </Form>
      </s-section>

      <s-section heading={t("Remplacer tous les codes")}>
        <s-paragraph>
          {t(
            "Remplace aussi les codes existants, y compris ceux des fabricants. Les étiquettes déjà collées ne scanneront plus. Pour confirmer, tapez « {phrase} ».",
            { phrase: t(replaceConfirmationPhrase(data.withCode)) },
          )}
        </s-paragraph>
        <Form method="post">
          <input type="hidden" name="intent" value="replace-all" />
          <input type="hidden" name="lang" value={lang} />
          <s-text-field name="confirmation" label={t("Confirmation")} autocomplete="off"></s-text-field>
          <s-button type="submit" tone="critical" disabled={busy}>
            {t("Remplacer tous les codes")}
          </s-button>
        </Form>
      </s-section>

      <s-section heading={t("Journal des changements")}>
        {data.batches.length === 0 ? (
          <s-paragraph>{t("Aucun changement pour l'instant.")}</s-paragraph>
        ) : (
          <s-unordered-list>
            {data.batches.map((b) => (
              <s-list-item key={b.batchId}>
                {new Date(b.date).toLocaleString(dateLocale(lang))} · {t(REASONS[b.reason] ?? b.reason)} · {t("{n} codes", { n: b.count })}
                {b.reason !== "rollback" && (
                  <Form method="post" style={{ display: "inline" }}>
                    <input type="hidden" name="intent" value="rollback" />
                    <input type="hidden" name="lang" value={lang} />
                    <input type="hidden" name="batchId" value={b.batchId} />
                    <s-button type="submit" variant="tertiary" disabled={busy}>
                      {t("Annuler ce lot")}
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
