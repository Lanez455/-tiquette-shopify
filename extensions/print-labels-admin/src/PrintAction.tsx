import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

interface Options {
  defaultTemplateId: string;
  templates: { id: string; name: string }[];
}

export default async () => {
  render(<PrintAction />, document.body);
};

// Les appels fetch() vers l'app portent automatiquement le jeton Shopify
const API = "/api/print-link";

function PrintAction() {
  const ids = shopify.data.selected.map((s) => s.id);
  const [options, setOptions] = useState<Options | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [src, setSrc] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(API)
      .then((r) => r.json() as Promise<Options>)
      .then((o) => {
        setOptions(o);
        setTemplateId(o.defaultTemplateId);
      })
      .catch(() => setError("Impossible de joindre l'app d'étiquettes"));
  }, []);

  // Chaque changement prépare un nouveau PDF : l'aperçu de Shopify suit
  useEffect(() => {
    if (!templateId) return;
    const q = quantity === "stock" ? "stock" : Number(quantity);
    setSrc(undefined);
    setError("");
    const timer = setTimeout(() => {
      fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, templateId, quantity: q }) })
        .then((r) => r.json() as Promise<{ url?: string; error?: string }>)
        .then((res) => (res.url ? setSrc(res.url) : setError(res.error ?? "Erreur")))
        .catch(() => setError("Impossible de préparer les étiquettes"));
    }, 300);
    return () => clearTimeout(timer);
  }, [templateId, quantity, ids.join(",")]);

  return (
    <s-admin-print-action src={src}>
      <s-stack direction="block" gap="base">
        {error && <s-banner tone="critical">{error}</s-banner>}
        <s-select
          label="Modèle d'étiquette"
          value={templateId}
          onChange={(e) => setTemplateId(e.currentTarget.value)}
          disabled={!options}
        >
          {options?.templates.map((t) => (
            <s-option key={t.id} value={t.id}>
              {t.name}
            </s-option>
          ))}
        </s-select>
        <s-select label="Étiquettes par variante" value={quantity} onChange={(e) => setQuantity(e.currentTarget.value)}>
          <s-option value="1">1</s-option>
          <s-option value="2">2</s-option>
          <s-option value="5">5</s-option>
          <s-option value="10">10</s-option>
          <s-option value="stock">Autant que le stock</s-option>
        </s-select>
        <s-text color="subdued">
          {ids.length > 1 ? `${ids.length} produits sélectionnés.` : "Toutes les variantes du produit."} Pour choisir variante par variante,
          ouvrez l'app.
        </s-text>
      </s-stack>
    </s-admin-print-action>
  );
}
