import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { t } from "./printLabels";

export default async () => {
  render(<s-button onClick={() => shopify.action.presentModal()}>{t("printLabels")}</s-button>, document.body);
};
