import "@shopify/ui-extensions";

//@ts-ignore
declare module "./src/PrintAction.tsx" {
  const shopify:
    | import("@shopify/ui-extensions/admin.product-details.print-action.render").Api
    | import("@shopify/ui-extensions/admin.product-index.selection-print-action.render").Api;
  const globalThis: { shopify: typeof shopify };
}
