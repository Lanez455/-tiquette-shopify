import "@shopify/ui-extensions/preact";
import { render } from "preact";

export default async () => {
  render(<s-button onClick={() => shopify.action.presentModal()}>Imprimer des étiquettes</s-button>, document.body);
};
