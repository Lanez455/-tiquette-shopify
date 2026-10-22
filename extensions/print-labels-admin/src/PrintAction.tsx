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

// Les appels fetch() vers l'app portent automatiquement le jeton Shopify.
// La langue de l'admin suit, pour que l'app réponde dans la même langue.
const t = (key: string, vars?: Record<string, string | number>) => String(shopify.i18n.translate(key, vars));
const API = () => `/api/print-link?locale=${t("lang")}`;

function PrintAction() {
  const ids = shopify.data.selected.map((s) => s.id);
  const selection = ids.join(",");
  const [options, setOptions] = useState<Options | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [src, setSrc] = useState<string | undefined>();
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(API())
      .then((r) => r.json() as Promise<Options>)
      .then((o) => {
        setOptions(o);
        setTemplateId(o.defaultTemplateId);
      })
      .catch(() => setError(t("unreachable")));
  }, []);

  // Chaque changement prépare un nouveau PDF : l'aperçu de Shopify suit
  useEffect(() => {
    if (!templateId) return;
    const q = quantity === "stock" ? "stock" : Number(quantity);
    setSrc(undefined);
    setError("");
    const timer = setTimeout(() => {
      fetch(API(), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids: selection ? selection.split(",") : [], templateId, quantity: q }) })
        .then((r) => r.json() as Promise<{ url?: string; error?: string }>)
        .then((res) => (res.url ? setSrc(res.url) : setError(res.error ?? t("error"))))
        .catch(() => setError(t("prepareFailed")));
    }, 300);
    return () => clearTimeout(timer);
  }, [templateId, quantity, selection]);

  return (
    <s-admin-print-action src={src}>
      <s-stack direction="block" gap="base">
        {error && <s-banner tone="critical">{error}</s-banner>}
        <s-select
          label={t("template")}
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
        <s-select label={t("perVariant")} value={quantity} onChange={(e) => setQuantity(e.currentTarget.value)}>
          <s-option value="1">1</s-option>
          <s-option value="2">2</s-option>
          <s-option value="5">5</s-option>
          <s-option value="10">10</s-option>
          <s-option value="stock">{t("asStock")}</s-option>
        </s-select>
        <s-text color="subdued">
          {ids.length > 1 ? t("selected", { n: ids.length }) : t("allVariants")} {t("openApp")}
        </s-text>
      </s-stack>
    </s-admin-print-action>
  );
}
