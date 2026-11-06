import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { NEWS } from "../lib/news";
import { authenticate } from "../shopify.server";
import { pdfUrl, printPdfUrl, requestPrint } from "../lib/print/client";
import { FREE_MONTHLY_LABELS, PLAN_NAMES, currentPlan } from "../lib/billing/plans";
import { labelsUsedThisMonth } from "../lib/billing/usage.server";
import { fetchCurrentPrices, findPriceChanges } from "../lib/print/promo";
import { fetchCatalogBarcodes } from "../lib/shopify/catalog";
import { gqlFromAdmin, type Gql } from "../lib/shopify/graphql";
import { getSettings } from "../lib/settings.server";
import { dateLocale } from "../lib/i18n";
import { useLang, useT } from "../lib/i18n/react";

const SOURCES: Record<string, string> = {
  product: "Produits",
  purchase_order: "Bon de commande",
  transfer: "Transfert",
  csv: "Fichier CSV",
  pos: "Caisse",
  receiving: "Réception",
  promo: "Promotions",
};

// Au-delà, compter les codes manquants demanderait trop d'appels à Shopify
// pour un simple écran d'accueil : l'écran Codes-barres fait le compte complet.
const MAX_VARIANTS_COUNTED = 2500;

const VARIANTS_COUNT = `#graphql
  query HomeVariantsCount { productVariantsCount { count } }`;

async function missingBarcodes(gql: Gql): Promise<number | null> {
  const { productVariantsCount } = await gql<{ productVariantsCount: { count: number } }>(VARIANTS_COUNT);
  if (productVariantsCount.count > MAX_VARIANTS_COUNTED) return null;
  const catalog = await fetchCatalogBarcodes(gql);
  return catalog.filter((v) => !v.barcode?.trim()).length;
}

async function pricesToRelabel(gql: Gql, shop: string): Promise<number> {
  const printed = await prisma.printedPrice.findMany({ where: { shop }, orderBy: { printedAt: "desc" }, take: 1000 });
  if (printed.length === 0) return 0;
  const current = await fetchCurrentPrices(gql, printed.map((p) => p.variantId));
  return findPriceChanges(printed, current).length;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;
  const gql = gqlFromAdmin(admin);
  const [recentJobs, jobCount, customTemplates, settings, used, plan, missing, relabel] = await Promise.all([
    prisma.printJob.findMany({ where: { shop }, orderBy: { createdAt: "desc" }, take: 10 }),
    prisma.printJob.count({ where: { shop } }),
    prisma.labelTemplate.count({ where: { shop } }),
    getSettings(shop),
    labelsUsedThisMonth(shop),
    currentPlan(gql, shop),
    missingBarcodes(gql),
    pricesToRelabel(gql, shop),
  ]);
  return {
    steps: {
      format: Boolean(settings.defaultTemplateId) || customTemplates > 0,
      barcodes: missing === 0,
      firstPrint: jobCount > 0,
    },
    stats: { used, plan, missing, relabel },
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      labelCount: job.labelCount,
      source: SOURCES[job.source] ?? job.source,
      createdAt: job.createdAt.toISOString(),
    })),
  };
};

const labelCount = (n: number) => (n === 1 ? "1 étiquette" : "{n} étiquettes");

export default function Home() {
  const t = useT();
  const lang = useLang();
  const { steps, stats, recentJobs } = useLoaderData<typeof loader>();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Réimpression en 1 clic (F16)
  async function reprint(id: string) {
    setBusy(id);
    setError(null);
    const result = await requestPrint({ reprintJobId: id });
    setBusy(null);
    if (result.error || !result.groups) return setError(result.error ?? "Réimpression impossible");
    for (const group of result.groups) await printPdfUrl(pdfUrl(group.pdfBase64)).catch(() => undefined);
  }

  const done = [steps.format, steps.barcodes, steps.firstPrint].filter(Boolean).length;

  return (
    <s-page heading={t("Étiquettes code-barres")}>
      <s-button slot="primary-action" variant="primary" href="/app/print">{t("Imprimer des étiquettes")}</s-button>
      {error && <s-banner tone="critical">{t(error)}</s-banner>}

      {done < 3 && (
        <s-section heading={t("Premiers pas")}>
          <s-paragraph>{t("{done} étapes sur 3 terminées.", { done })}</s-paragraph>
          <s-stack gap="base">
            <Step
              done={steps.format}
              title={t("Choisir le format de vos étiquettes")}
              detail={t("Dymo, Zebra, Brother, planches Avery ou taille libre : créez un modèle et mettez-le par défaut.")}
              action={t("Voir les modèles")}
              href="/app/templates"
            />
            <Step
              done={steps.barcodes}
              title={t("Donner un code-barres à chaque variante")}
              detail={
                stats.missing === null
                  ? t("Vérifiez les variantes sans code-barres et créez-les en un clic, sans toucher aux codes existants.")
                  : t("{n} variantes n'ont pas de code-barres. Créez-les en un clic, sans toucher aux codes existants.", { n: stats.missing })
              }
              action={t("Créer les codes")}
              href="/app/barcodes"
            />
            <Step
              done={steps.firstPrint}
              title={t("Imprimer votre première étiquette")}
              detail={t("Choisissez des produits, une quantité, puis imprimez ou regardez l'aperçu.")}
              action={t("Imprimer")}
              href="/app/print"
            />
          </s-stack>
        </s-section>
      )}

      <s-section heading={t("En un coup d'œil")}>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(150px, 1fr))" gap="base">
          <Stat
            label={t("Imprimées ce mois-ci")}
            value={stats.plan === "free" ? `${stats.used} / ${FREE_MONTHLY_LABELS}` : String(stats.used)}
            href="/app/plans"
          />
          <Stat label={t("Formule")} value={t(PLAN_NAMES[stats.plan])} href="/app/plans" />
          <Stat
            label={t("Variantes sans code-barres")}
            value={stats.missing === null ? "—" : String(stats.missing)}
            tone={stats.missing ? "warning" : undefined}
            href="/app/barcodes"
          />
          <Stat
            label={t("Étiquettes à refaire (prix changés)")}
            value={String(stats.relabel)}
            tone={stats.relabel ? "warning" : undefined}
            href="/app/promos"
          />
        </s-grid>
      </s-section>

      <s-section heading={t("Raccourcis")}>
        <s-stack direction="inline" gap="base">
          <s-button href="/app/print">{t("Imprimer des étiquettes")}</s-button>
          <s-button href="/app/receive">{t("Réception par scan")}</s-button>
          <s-button href="/app/promos">{t("Prix changés")}</s-button>
          <s-button href="/app/templates">{t("Modèles")}</s-button>
          <s-button href="/app/help">{t("Aide")}</s-button>
        </s-stack>
      </s-section>

      <s-section heading={t("Dernières impressions")}>
        {recentJobs.length === 0 ? (
          <s-paragraph>{t("Aucune impression pour l'instant.")}</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>{t("Date")}</s-table-header>
              <s-table-header>{t("Origine")}</s-table-header>
              <s-table-header>{t("Étiquettes")}</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {recentJobs.map((job) => (
                <s-table-row key={job.id}>
                  <s-table-cell>{new Date(job.createdAt).toLocaleString(dateLocale(lang))}</s-table-cell>
                  <s-table-cell>{t(job.source)}</s-table-cell>
                  <s-table-cell>{t(labelCount(job.labelCount), { n: job.labelCount })}</s-table-cell>
                  <s-table-cell>
                    <s-button variant="tertiary" disabled={busy !== null} onClick={() => reprint(job.id)}>
                      {t(busy === job.id ? "Préparation…" : "Réimprimer")}
                    </s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
      </s-section>
      <s-section heading={t("Nouveautés")}>
        {NEWS.slice(0, 1).map((n) => (
          <s-stack key={n.version} gap="base">
            <s-text type="strong">{t("Version {version}", { version: n.version })}</s-text>
            <s-unordered-list>
              {n.items.map((item) => <s-list-item key={item}>{t(item)}</s-list-item>)}
            </s-unordered-list>
          </s-stack>
        ))}
      </s-section>
    </s-page>
  );
}

function Step({ done, title, detail, action, href }: { done: boolean; title: string; detail: string; action: string; href: string }) {
  const t = useT();
  return (
    <s-box padding="base" borderWidth="base" borderRadius="base">
      <s-stack direction="inline" gap="base" alignItems="center" justifyContent="space-between">
        <s-stack gap="small-200">
          <s-text type="strong">{done ? "✓ " : ""}{title}</s-text>
          {!done && <s-text color="subdued">{detail}</s-text>}
        </s-stack>
        {done ? <s-badge tone="success">{t("Fait")}</s-badge> : <s-button href={href}>{action}</s-button>}
      </s-stack>
    </s-box>
  );
}

function Stat({ label, value, tone, href }: { label: string; value: string; tone?: "warning"; href: string }) {
  const t = useT();
  return (
    <s-clickable href={href} padding="base" borderWidth="base" borderRadius="base">
      <s-stack gap="small-200">
        <s-text color="subdued">{label}</s-text>
        <s-heading>{value}</s-heading>
        {tone && <s-badge tone={tone}>{t("À traiter")}</s-badge>}
      </s-stack>
    </s-clickable>
  );
}
