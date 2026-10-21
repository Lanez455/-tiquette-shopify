import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { pdfUrl, printPdfUrl, requestPrint } from "../lib/print/client";

const SOURCES: Record<string, string> = {
  product: "Produits",
  purchase_order: "Bon de commande",
  transfer: "Transfert",
  csv: "Fichier CSV",
  pos: "Caisse",
  receiving: "Réception",
  promo: "Promotions",
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const recentJobs = await prisma.printJob.findMany({
    where: { shop: session.shop },
    orderBy: { createdAt: "desc" },
    take: 10,
  });
  return {
    recentJobs: recentJobs.map((job) => ({
      id: job.id,
      labelCount: job.labelCount,
      source: SOURCES[job.source] ?? job.source,
      createdAt: job.createdAt.toISOString(),
    })),
  };
};

export default function Home() {
  const { recentJobs } = useLoaderData<typeof loader>();
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

  return (
    <s-page heading="Étiquettes code-barres">
      <s-button slot="primary-action" href="/app/print">Imprimer des étiquettes</s-button>
      {error && <s-banner tone="critical">{error}</s-banner>}
      <s-section heading="Dernières impressions">
        {recentJobs.length === 0 ? (
          <s-paragraph>Aucune impression pour l'instant.</s-paragraph>
        ) : (
          <s-unordered-list>
            {recentJobs.map((job) => (
              <s-list-item key={job.id}>
                {new Date(job.createdAt).toLocaleString("fr-FR")} · {job.source} · {job.labelCount} étiquettes{" "}
                <s-button variant="tertiary" disabled={busy !== null} onClick={() => reprint(job.id)}>
                  {busy === job.id ? "Préparation…" : "Réimprimer"}
                </s-button>
              </s-list-item>
            ))}
          </s-unordered-list>
        )}
      </s-section>
    </s-page>
  );
}
