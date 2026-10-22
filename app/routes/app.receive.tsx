import { useRef, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigate } from "react-router";
import { authenticate } from "../shopify.server";
import { gqlFromAdmin } from "../lib/shopify/graphql";
import { listLocations } from "../lib/shopify/receiving";
import { can, currentPlan, PlanLimitError } from "../lib/billing/plans";
import type { ScanResult } from "./app.receive.scan";
import { useT } from "../lib/i18n/react";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const gql = gqlFromAdmin(admin);
  const plan = await currentPlan(gql, session.shop);
  if (!can(plan, "receiving")) return { locations: [], locked: new PlanLimitError("receiving").message };
  return { locations: await listLocations(gql), locked: null };
};

interface Received {
  variantId: string;
  inventoryItemId: string;
  name: string;
  count: number;
  stock: number;
}

export default function Receive() {
  const t = useT();
  const { locations, locked } = useLoaderData<typeof loader>();
  const navigate = useNavigate();
  const [locationId, setLocationId] = useState(locations[0]?.id ?? "");
  const [code, setCode] = useState("");
  const [received, setReceived] = useState<Received[]>([]);
  const [last, setLast] = useState<{ tone: "success" | "critical"; text: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  // Les scans partent un par un, dans l'ordre : une douchette rapide n'en perd aucun
  const queue = useRef(Promise.resolve());
  const [pending, setPending] = useState(0);

  const send = (fields: Record<string, string>) => {
    setPending((n) => n + 1);
    const body = new URLSearchParams({ ...fields, locationId, key: crypto.randomUUID() });
    queue.current = queue.current.then(async () => {
      try {
        const response = await fetch("/app/receive/scan", { method: "POST", body });
        apply((await response.json()) as ScanResult);
      } catch {
        setLast({ tone: "critical", text: t("Connexion perdue : ce scan n'a pas été compté, scannez-le à nouveau.") });
      } finally {
        setPending((n) => n - 1);
      }
    });
  };

  const apply = (r: ScanResult) => {
    if (!r.ok) return setLast({ tone: "critical", text: t(r.error) });
    setReceived((list) => {
      const existing = list.find((x) => x.variantId === r.variantId);
      if (existing) {
        const updated = { ...existing, count: existing.count + r.delta, stock: r.stock };
        return [updated, ...list.filter((x) => x.variantId !== r.variantId)].filter((x) => x.count > 0);
      }
      return r.delta > 0 ? [{ variantId: r.variantId, inventoryItemId: r.inventoryItemId, name: r.name, count: 1, stock: r.stock }, ...list] : list;
    });
    setLast({ tone: "success", text: t("{delta} {name} (stock : {stock})", { delta: r.delta > 0 ? "+1" : "−1", name: r.name, stock: r.stock }) });
    input.current?.focus();
  };

  // La douchette tape le code puis Entrée
  const scan = (event: React.FormEvent) => {
    event.preventDefault();
    if (!code.trim() || !locationId) return;
    send({ intent: "scan", code });
    setCode("");
  };

  const undo = (item: Received) =>
    send({ intent: "undo", inventoryItemId: item.inventoryItemId, variantId: item.variantId, name: item.name });

  const total = received.reduce((s, r) => s + r.count, 0);
  const printQueue = () => {
    const lines = received.map((r) => `${r.variantId.split("/").pop()}:${r.count}`).join(",");
    navigate(`/app/print?lines=${encodeURIComponent(lines)}&source=receiving`);
  };

  return (
    <s-page heading={t("Réception par scan")}>
      {locked && <s-banner tone="info">{t(locked)}</s-banner>}
      <s-section>
        <s-select label={t("Magasin qui reçoit")} value={locationId} onChange={(e) => setLocationId(e.currentTarget.value)}>
          {locations.map((l) => (
            <s-option key={l.id} value={l.id}>{l.name}</s-option>
          ))}
        </s-select>
        <form onSubmit={scan}>
          <label>
            {t("Scannez un article (chaque scan ajoute 1 au stock)")}{" "}
            <input ref={input} autoFocus value={code} onChange={(e) => setCode(e.currentTarget.value)} autoComplete="off" inputMode="none" />
          </label>
        </form>
        {last && <s-banner tone={last.tone}>{last.text}</s-banner>}
      </s-section>

      <s-section heading={t("{n} article(s) reçu(s)", { n: total })}>
        {received.length === 0 ? (
          <s-paragraph>{t("Les articles scannés s'affichent ici avec leurs étiquettes à imprimer.")}</s-paragraph>
        ) : (
          <s-table>
            <s-table-header-row>
              <s-table-header>{t("Article")}</s-table-header>
              <s-table-header>{t("Reçus")}</s-table-header>
              <s-table-header>{t("Stock")}</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {received.map((r) => (
                <s-table-row key={r.variantId}>
                  <s-table-cell>{r.name}</s-table-cell>
                  <s-table-cell>{r.count}</s-table-cell>
                  <s-table-cell>{r.stock}</s-table-cell>
                  <s-table-cell>
                    <s-button variant="tertiary" onClick={() => undo(r)}>{t("Annuler 1")}</s-button>
                  </s-table-cell>
                </s-table-row>
              ))}
            </s-table-body>
          </s-table>
        )}
        <s-button variant="primary" disabled={!total || pending > 0} onClick={printQueue}>{t("Imprimer {n} étiquette(s)", { n: total })}</s-button>
      </s-section>
    </s-page>
  );
}
