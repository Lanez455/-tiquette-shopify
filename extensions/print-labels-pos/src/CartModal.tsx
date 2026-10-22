import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { printLabels, t } from "./printLabels";

export default async () => {
  render(<CartModal />, document.body);
};

// Une étiquette par article du panier, quantités modifiables avant impression
function CartModal() {
  const lineItems = shopify.cart.current.value.lineItems.filter((l) => l.variantId);
  const [quantities, setQuantities] = useState(lineItems.map((l) => l.quantity));
  const [busy, setBusy] = useState(false);
  const total = quantities.reduce((a, b) => a + b, 0);

  const print = async () => {
    setBusy(true);
    const ok = await printLabels(lineItems.map((l, i) => ({ variantId: l.variantId!, quantity: quantities[i] ?? 0 })));
    setBusy(false);
    if (ok) window.close();
  };

  return (
    <s-page heading={t("cartLabels")}>
      <s-scroll-box>
        <s-stack direction="block" gap="base">
          {lineItems.map((line, i) => (
            <s-number-field
              key={line.uuid}
              label={line.title ?? t("item")}
              value={String(quantities[i])}
              min={0}
              max={1000}
              onChange={(e) => {
                const next = [...quantities];
                next[i] = Math.max(0, Math.min(1000, Math.floor(Number(e.currentTarget.value) || 0)));
                setQuantities(next);
              }}
            />
          ))}
          <s-button variant="primary" disabled={busy || !total} onClick={print}>
            {t("printN", { n: total })}
          </s-button>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
