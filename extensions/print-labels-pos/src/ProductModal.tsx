import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useState } from "preact/hooks";
import { printLabels, t } from "./printLabels";

export default async () => {
  render(<ProductModal />, document.body);
};

function ProductModal() {
  const [quantity, setQuantity] = useState(1);
  const [busy, setBusy] = useState(false);

  const print = async () => {
    setBusy(true);
    await printLabels([{ variantId: shopify.product.variantId, quantity }]);
    setBusy(false);
  };

  return (
    <s-page heading={t("labels")}>
      <s-stack direction="block" gap="base">
        <s-number-field
          label={t("howMany")}
          value={String(quantity)}
          min={1}
          max={1000}
          onChange={(e) => setQuantity(Math.max(1, Math.min(1000, Math.floor(Number(e.currentTarget.value) || 1))))}
        />
        <s-button variant="primary" disabled={busy} onClick={print}>
          {t("print")}
        </s-button>
      </s-stack>
    </s-page>
  );
}
