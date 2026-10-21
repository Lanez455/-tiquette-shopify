import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

export default async () => {
  render(<Tile />, document.body);
};

function Tile() {
  const count = () => shopify.cart.current.value.lineItems.filter((l) => l.variantId).length;
  const [items, setItems] = useState(count());
  useEffect(() => shopify.cart.current.subscribe(() => setItems(count())), []);
  return (
    <s-tile
      heading="Étiquettes"
      subheading={items ? `${items} article(s) du panier` : "Ajoutez des articles au panier"}
      disabled={!items}
      onClick={() => shopify.action.presentModal()}
    />
  );
}
