// Faux Shopify pour les essais de bout en bout : l'app de production lui parle
// en HTTPS comme à une vraie boutique (échange de jeton, API GraphQL Admin).
// Les réponses viennent de la fausse boutique des tests, qui applique aussi la
// limite de coût de Shopify.
import { readFileSync } from "node:fs";
import { createServer } from "node:https";
import { FakeShop } from "../../app/testing/fakeShop";

const [, , keyPath, certPath, portArg] = process.argv;

class MockShop extends FakeShop {
  subscriptions: { id: string; name: string; status: string; test: boolean }[] = [];
  // Nombre de prochaines requêtes à refuser en THROTTLED
  throttleNext = 0;

  opActiveSubscriptions() {
    return { currentAppInstallation: { activeSubscriptions: this.subscriptions.filter((s) => s.status === "ACTIVE").map(({ name, status }) => ({ name, status })) } };
  }

  // Requête de la bibliothèque Shopify (billing.check)
  opappSubscription() {
    return {
      currentAppInstallation: {
        activeSubscriptions: this.subscriptions.filter((s) => s.status === "ACTIVE").map((s) => ({ ...s, lineItems: [] })),
        oneTimePurchases: { edges: [], pageInfo: { hasNextPage: false, endCursor: null } },
      },
    };
  }
}

export function demoShop(): MockShop {
  const shop = new MockShop();
  shop.addProduct(
    {
      id: "gid://shopify/Product/1", title: "Bague Lune", vendor: "Atelier Lune", productType: "Bijou",
      collectionIds: ["gid://shopify/Collection/10"], onlineStoreUrl: "https://e2e-test.myshopify.com/products/bague-lune",
      metafields: [{ namespace: "custom", key: "matiere", value: "Argent 925" }], createdAt: "2026-10-01",
    },
    [
      { id: "gid://shopify/ProductVariant/11", title: "52", sku: "BL-52", barcode: "2000000000015", price: "29.90", inventoryQuantity: 3 },
      { id: "gid://shopify/ProductVariant/12", title: "54", sku: "BL-54", barcode: null, price: "29.90", inventoryQuantity: 1 },
    ],
  );
  shop.addProduct(
    { id: "gid://shopify/Product/2", title: "T-shirt coton bio", vendor: "Atelier Lune", productType: "Vêtement", createdAt: "2026-09-01" },
    [{ id: "gid://shopify/ProductVariant/21", title: "M", sku: "TS-M", barcode: "3760000000017", price: "19.00", compareAtPrice: "25.00", inventoryQuantity: 12 }],
  );
  // Un produit à 300 variantes : au-delà de ce qu'un variants(first: 250) rendrait
  shop.addProduct(
    { id: "gid://shopify/Product/3", title: "Perles au détail", vendor: "Perlerie", productType: "Perle", createdAt: "2026-08-01" },
    Array.from({ length: 300 }, (_, i) => ({ id: `gid://shopify/ProductVariant/${3000 + i}`, title: `Teinte ${i + 1}`, sku: `PE-${i + 1}`, price: "0.50", inventoryQuantity: 40 })),
  );
  shop.inventoryDocs.set("gid://shopify/InventoryPurchaseOrder/5", {
    name: "BC-0005", status: "ORDERED", dateCreated: "2026-10-15T10:00:00Z",
    lines: [{ variantId: "gid://shopify/ProductVariant/11", quantity: 4 }, { variantId: null, quantity: 2 }],
  });
  for (const v of shop.variants.keys()) shop.stock.set(`item-${v}|gid://shopify/Location/1`, shop.variants.get(v)!.inventoryQuantity);
  return shop;
}

if (keyPath && certPath) {
  const shop = demoShop();
  const log: { operation: string; status: string }[] = [];
  const server = createServer({ key: readFileSync(keyPath), cert: readFileSync(certPath) }, async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const raw = Buffer.concat(chunks).toString("utf8");
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const url = new URL(req.url ?? "/", "https://e2e-test.myshopify.com");

    // Pilotage par le script d'essai
    if (url.pathname === "/__mock/state") return json(200, { log, subscriptions: shop.subscriptions, barcodes: Object.fromEntries([...shop.variants].map(([id, v]) => [id, v.barcode])) });
    if (url.pathname === "/__mock/throttle") { shop.throttleNext = Number(url.searchParams.get("n") ?? 1); return json(200, { ok: true }); }
    if (url.pathname === "/__mock/subscribe") {
      shop.subscriptions = [{ id: "gid://shopify/AppSubscription/1", name: url.searchParams.get("plan") ?? "Magasin", status: "ACTIVE", test: true }];
      return json(200, { ok: true });
    }

    // Échange du jeton de session contre un jeton d'accès hors ligne (expirant)
    if (url.pathname === "/admin/oauth/access_token") {
      const params = new URLSearchParams(raw.startsWith("{") ? (JSON.parse(raw) as Record<string, string>) : raw);
      if (!params.get("subject_token")) return json(400, { error: "invalid_request" });
      return json(200, {
        access_token: "shpat_e2e", scope: process.env.SCOPES ?? "",
        expires_in: 3600, refresh_token: "shprt_e2e", refresh_token_expires_in: 7776000,
      });
    }

    const graphql = /^\/admin\/api\/([\w-]+)\/graphql\.json$/.exec(url.pathname);
    if (graphql) {
      if (req.headers["x-shopify-access-token"] !== "shpat_e2e") return json(401, { errors: "[API] Invalid API key or access token" });
      const { query, variables } = JSON.parse(raw) as { query: string; variables?: Record<string, unknown> };
      const operation = /(?:query|mutation)\s+(\w+)/.exec(query)?.[1] ?? "anonymous";
      if (shop.throttleNext > 0) {
        shop.throttleNext--;
        log.push({ operation, status: "THROTTLED" });
        return json(200, {
          errors: [{ message: "Throttled", extensions: { code: "THROTTLED", documentation: "https://shopify.dev/api/usage/rate-limits" } }],
          extensions: { cost: { requestedQueryCost: 150, actualQueryCost: null, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 100, restoreRate: 100 } } },
        });
      }
      // Mutations de facturation de la bibliothèque Shopify
      if (operation === "appSubscriptionCreate" || /appSubscriptionCreate\(/.test(query)) {
        log.push({ operation, status: "ok" });
        return json(200, { data: { appSubscriptionCreate: { appSubscription: { id: "gid://shopify/AppSubscription/2" }, confirmationUrl: "https://e2e-test.myshopify.com/admin/charges/confirm", userErrors: [] } } });
      }
      if (/appSubscriptionCancel\(/.test(query)) {
        shop.subscriptions = [];
        log.push({ operation, status: "ok" });
        return json(200, { data: { appSubscriptionCancel: { appSubscription: { id: "gid://shopify/AppSubscription/1", status: "CANCELLED" }, userErrors: [] } } });
      }
      try {
        const data = await shop.gql(query, variables ?? {});
        log.push({ operation, status: "ok" });
        return json(200, { data, extensions: { cost: { requestedQueryCost: 1, throttleStatus: { maximumAvailable: 2000, currentlyAvailable: 1999, restoreRate: 100 } } } });
      } catch (error) {
        log.push({ operation, status: `error: ${(error as Error).message}` });
        return json(200, { errors: [{ message: (error as Error).message }] });
      }
    }
    json(404, { errors: "Not Found" });
  });
  server.listen(Number(portArg ?? 443), "127.0.0.1", () => console.log("mock-admin prêt"));
}
