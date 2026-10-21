// Essai de bout en bout : l'app compilée (npm run build) tourne comme en
// production, face au faux Shopify de mockAdmin.ts. Chaque vérification passe
// par HTTP, avec de vrais jetons de session signés et de vrais webhooks HMAC.
//
//   npm run build && npm run e2e
//
// Prérequis : la boutique e2e-test.myshopify.com pointe sur 127.0.0.1
// (/etc/hosts) et le port 443 est libre. Le certificat est créé à la volée.
import { execFileSync, execSync, spawn, type ChildProcess } from "node:child_process";
import { get as httpsGet } from "node:https";
import { createRequire } from "node:module";
import { createHmac, randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

const SHOP = "e2e-test.myshopify.com";
const KEY = "e2e-api-key";
const SECRET = "e2e-api-secret";
const PORT = 3100;
const APP = `http://localhost:${PORT}`;
const SCOPES = "read_products,write_products,read_inventory,write_inventory,read_locations,read_inventory_purchase_orders,read_inventory_transfers";
const ROOT = new URL("../..", import.meta.url).pathname;

const dir = mkdtempSync(join(tmpdir(), "e2e-"));
const DB = `file:${join(dir, "e2e.sqlite")}`;
const children: ChildProcess[] = [];
const results: { name: string; ok: boolean; detail: string }[] = [];

// Les requêtes sans navigateur sont prises pour des robots (410) : on se présente comme Chrome
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";
const nodeFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const headers = new Headers(init?.headers);
  if (!headers.has("User-Agent")) headers.set("User-Agent", UA);
  return nodeFetch(input, { ...init, headers });
};

const b64url = (s: string | Buffer) => Buffer.from(s).toString("base64url");
function sessionToken(sub = "42"): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({
    iss: `https://${SHOP}/admin`, dest: `https://${SHOP}`, aud: KEY, sub, exp: now + 60, nbf: now - 5, iat: now - 5,
    jti: randomUUID(), sid: randomUUID(),
  }));
  return `${header}.${payload}.${b64url(createHmac("sha256", SECRET).update(`${header}.${payload}`).digest())}`;
}
const host = b64url(`admin.shopify.com/store/e2e-test`);
const embedded = (path: string) => `${APP}${path}${path.includes("?") ? "&" : "?"}embedded=1&shop=${SHOP}&host=${host}&id_token=${sessionToken()}`;
const bearer = (extra: Record<string, string> = {}) => ({ Authorization: `Bearer ${sessionToken()}`, ...extra });

async function check(name: string, fn: () => Promise<string | void>) {
  try {
    const detail = (await fn()) ?? "";
    results.push({ name, ok: true, detail });
    console.log(`  ✓ ${name}${detail ? ` (${detail})` : ""}`);
  } catch (error) {
    results.push({ name, ok: false, detail: (error as Error).message });
    console.log(`  ✗ ${name} : ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
// Pilotage du faux Shopify : son certificat n'est connu que par l'app, qui le lit au démarrage
function mock(path: string): Promise<{ log: { operation: string; status: string }[]; barcodes: Record<string, string | null> }> {
  return new Promise((resolve, reject) => {
    httpsGet(`https://${SHOP}${path}`, { ca: readFileSync(`${dir}/cert.pem`) }, (res) => {
      let body = "";
      res.on("data", (d) => (body += d));
      res.on("end", () => resolve(JSON.parse(body)));
    }).on("error", reject);
  });
}
const pdfText = (pdf: Buffer) => {
  const file = join(dir, `${randomUUID()}.pdf`);
  writeFileSync(file, pdf);
  return execFileSync("pdftotext", ["-layout", file, "-"]).toString();
};

async function waitFor(probe: () => Promise<unknown>, url: string) {
  for (let i = 0; i < 100; i++) {
    try {
      await probe();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }
  throw new Error(`${url} ne répond pas`);
}

async function main() {
  // Certificat du faux Shopify, ajouté aux autorités de confiance du serveur de l'app
  execSync(`openssl req -x509 -newkey rsa:2048 -nodes -keyout ${dir}/key.pem -out ${dir}/cert.pem -days 1 -subj "/CN=${SHOP}" -addext "subjectAltName=DNS:${SHOP}"`, { stdio: "ignore" });
  const extraCa = process.env.NODE_EXTRA_CA_CERTS ? readFileSync(process.env.NODE_EXTRA_CA_CERTS, "utf8") : "";
  writeFileSync(`${dir}/ca.pem`, `${extraCa}\n${readFileSync(`${dir}/cert.pem`, "utf8")}`);
  process.env.NODE_EXTRA_CA_CERTS = `${dir}/ca.pem`;

  execSync("npx prisma migrate deploy", { cwd: ROOT, env: { ...process.env, DATABASE_URL: DB }, stdio: "ignore" });

  const mockProc = spawn("npx", ["vite-node", "--config", "vitest.config.ts", "scripts/e2e/mockAdmin.ts", `${dir}/key.pem`, `${dir}/cert.pem`, "443"], {
    cwd: ROOT, env: { ...process.env, SCOPES }, stdio: ["ignore", "inherit", "inherit"], detached: true,
  });
  children.push(mockProc);
  const appProc = spawn("npx", ["react-router-serve", "./build/server/index.js"], {
    cwd: ROOT,
    env: {
      ...process.env, PORT: String(PORT), NODE_ENV: "production", DATABASE_URL: DB, SHOPIFY_API_KEY: KEY, SHOPIFY_API_SECRET: SECRET,
      SHOPIFY_APP_URL: APP, SCOPES, BILLING_TEST: "true", NODE_EXTRA_CA_CERTS: `${dir}/ca.pem`,
    },
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  children.push(appProc);
  let appLog = "";
  appProc.stdout!.on("data", (d) => (appLog += d));
  appProc.stderr!.on("data", (d) => (appLog += d));
  await waitFor(() => mock("/__mock/state"), "faux Shopify");
  await waitFor(() => fetch(APP), APP);

  console.log("Pages de l'admin (document chargé dans l'iframe Shopify)");
  for (const [path, expected] of [
    ["/app", "Étiquettes"], ["/app/print", "Impression"], ["/app/templates", "Modèles"], ["/app/barcodes", "Codes-barres"],
    ["/app/settings", "Réglages"], ["/app/receive", "Réception"], ["/app/promos", "Prix changés"], ["/app/plans", "Formules"], ["/app/help", ""],
  ] as const) {
    await check(`GET ${path}`, async () => {
      const res = await fetch(embedded(path));
      const html = await res.text();
      assert(res.status === 200, `statut ${res.status} : ${html.slice(0, 200)}`);
      assert(!expected || html.includes(expected), `« ${expected} » absent de la page`);
      return `${html.length} octets`;
    });
  }

  await check("Sans jeton, aucune donnée : redirection ou page de rebond Shopify", async () => {
    const res = await fetch(`${APP}/app/print?shop=${SHOP}`, { redirect: "manual" });
    const html = await res.text();
    if (res.status === 302 || res.status === 401) return `statut ${res.status} → ${res.headers.get("location") ?? ""}`;
    // Page de rebond : App Bridge redemande un jeton puis recharge la page
    assert(res.status === 200 && html.includes("app-bridge") && !html.includes("Impression"), `statut ${res.status} : ${html.slice(0, 300)}`);
    return "page de rebond App Bridge, sans contenu de l'app";
  });
  await check("Jeton signé avec un mauvais secret refusé", async () => {
    const [h, p] = sessionToken().split(".");
    const forged = `${h}.${p}.${b64url(createHmac("sha256", "faux").update(`${h}.${p}`).digest())}`;
    const res = await fetch(`${APP}/app/print/pdf`, { method: "POST", headers: { Authorization: `Bearer ${forged}`, "Content-Type": "application/json" }, body: "{}" });
    assert(res.status === 401 || res.status === 403 || res.status === 302, `statut ${res.status}`);
    return `statut ${res.status}`;
  });

  console.log("Impression");
  await check("Produit de 300 variantes : toutes listées dans la file", async () => {
    const html = await (await fetch(embedded(`/app/print?ids=${encodeURIComponent("gid://shopify/Product/3")}`))).text();
    assert(html.includes("Teinte 300") && html.includes("Teinte 1"), "variantes manquantes");
    return "Teinte 1 à Teinte 300 présentes";
  });

  const printPdf = (body: unknown) =>
    fetch(`${APP}/app/print/pdf`, { method: "POST", headers: bearer({ "Content-Type": "application/json" }), body: JSON.stringify(body) });

  await check("PDF imprimé (formule Gratuit) avec titre, prix et code-barres", async () => {
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/11", quantity: 2 }, { variantId: "gid://shopify/ProductVariant/21", quantity: 1 }], templateId: "builtin:dymo-30336" });
    const body = (await res.json()) as { groups?: { pdfBase64: string; labelCount: number }[]; error?: string };
    assert(res.status === 200 && body.groups?.length === 1, `statut ${res.status} ${body.error ?? ""}`);
    const pdf = Buffer.from(body.groups[0]!.pdfBase64, "base64");
    assert(pdf.subarray(0, 5).toString() === "%PDF-", "pas un PDF");
    const text = pdfText(pdf);
    assert(text.includes("Bague Lune") && text.includes("T-shirt"), `texte : ${text.slice(0, 200)}`);
    assert(/29,90/.test(text), "prix au format français absent");
    return `${body.groups[0]!.labelCount} étiquettes, ${pdf.length} octets`;
  });

  await check("Quota Gratuit : 60 étiquettes refusées avec un message clair", async () => {
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/21", quantity: 60 }], templateId: "builtin:dymo-30336" });
    const body = (await res.json()) as { error?: string };
    assert(res.status === 402 && /50 étiquettes par mois/.test(body.error ?? ""), `statut ${res.status} ${body.error}`);
    return body.error!;
  });

  await check("Impression directe Zebra refusée en Gratuit", async () => {
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/21", quantity: 1 }], templateId: "builtin:dymo-30336", output: "zpl" });
    assert(res.status === 402, `statut ${res.status}`);
  });

  // Passage à la formule Magasin chez Shopify, puis retour sur la page Formules
  await mock("/__mock/subscribe?plan=Magasin");
  await check("Après abonnement, la page Formules affiche Magasin", async () => {
    const html = await (await fetch(embedded("/app/plans"))).text();
    assert(/Formule actuelle : (<!-- -->)?Magasin/.test(html), "formule non mise à jour");
  });

  await check("Magasin : impression directe Zebra (ZPL)", async () => {
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/11", quantity: 1 }], templateId: "builtin:zebra-2x1", output: "zpl" });
    const body = (await res.json()) as { direct?: { zpl?: string }[]; jobId?: string; error?: string };
    assert(res.status === 200 && body.direct?.[0]?.zpl?.startsWith("^XA"), `statut ${res.status} ${body.error ?? JSON.stringify(body).slice(0, 200)}`);
    assert(body.jobId, "jobId absent : pas de repli PDF possible");
    // Repli PDF sur la même impression, sans la recompter
    const fallback = await printPdf({ reprintJobId: body.jobId, fallback: true });
    assert(fallback.status === 200, `repli : statut ${fallback.status}`);
    return `${body.direct?.[0]?.zpl?.length} caractères ZPL, repli PDF ok`;
  });

  // Modèle personnalisé lié à une collection, avec un métachamp
  const db = new PrismaClient({ datasourceUrl: DB });
  const layout = { elements: [
    { kind: "field", field: "title", xMm: 1, yMm: 1, wMm: 45, hMm: 6, maxFontSize: 10, minFontSize: 5 },
    { kind: "field", field: "metafield:product.custom.matiere", xMm: 1, yMm: 8, wMm: 45, hMm: 5, maxFontSize: 8, minFontSize: 5 },
    { kind: "barcode", xMm: 1, yMm: 14, wMm: 45, hMm: 10, showDigits: true },
  ] };
  const template = await db.labelTemplate.create({
    data: { shop: SHOP, name: "Bijoux", formatId: "zebra-2x1", widthMm: 50.8, heightMm: 25.4, shape: "rect", layoutJson: JSON.stringify(layout), collectionIds: "gid://shopify/Collection/10" },
  });

  await check("Automatique selon la collection : deux PDF, métachamp imprimé", async () => {
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/11", quantity: 1 }, { variantId: "gid://shopify/ProductVariant/21", quantity: 1 }], templateId: "auto" });
    const body = (await res.json()) as { groups?: { templateName: string; pdfBase64: string }[]; error?: string };
    assert(res.status === 200 && body.groups?.length === 2, `statut ${res.status} ${body.error ?? JSON.stringify(body.groups?.map((g) => g.templateName))}`);
    const bijoux = body.groups.find((g) => g.templateName === "Bijoux");
    assert(bijoux, "groupe Bijoux absent");
    const text = pdfText(Buffer.from(bijoux.pdfBase64, "base64"));
    assert(text.includes("Argent 925"), `métachamp absent : ${text.slice(0, 200)}`);
    return body.groups.map((g) => g.templateName).join(" + ");
  });

  await check("Débit limité par Shopify (THROTTLED) : l'app attend et réessaie", async () => {
    await mock("/__mock/throttle?n=2");
    const started = Date.now();
    const res = await printPdf({ lines: [{ variantId: "gid://shopify/ProductVariant/21", quantity: 1 }], templateId: "builtin:dymo-30336" });
    assert(res.status === 200, `statut ${res.status} ${(await res.text()).slice(0, 200)}`);
    const { log } = await mock("/__mock/state");
    assert(log.filter((l) => l.status === "THROTTLED").length === 2, "pas de THROTTLED vu");
    return `réussi après 2 refus, ${Date.now() - started} ms`;
  });

  await check("Aucune requête refusée pour coût excessif pendant l'essai", async () => {
    const { log } = await mock("/__mock/state");
    const refused = log.filter((l) => l.status.startsWith("error"));
    assert(!refused.length, refused.map((l) => `${l.operation} ${l.status}`).join(" ; "));
    return `${log.length} requêtes GraphQL`;
  });

  console.log("Bouton Imprimer de l'admin et caisse");
  await check("Lien signé : création puis PDF, signature falsifiée refusée", async () => {
    const res = await fetch(`${APP}/api/print-link`, { method: "POST", headers: bearer({ "Content-Type": "application/json", Origin: "https://extensions.shopifycdn.com" }), body: JSON.stringify({ ids: ["gid://shopify/Product/1"], quantity: 1, templateId: "builtin:dymo-30336" }) });
    const body = (await res.json()) as { url?: string; error?: string };
    assert(res.status === 200 && body.url, `statut ${res.status} ${body.error}`);
    assert(res.headers.get("access-control-allow-origin"), "en-têtes CORS absents");
    const pdf = await fetch(body.url);
    assert(pdf.status === 200 && pdf.headers.get("content-type") === "application/pdf", `PDF : statut ${pdf.status}`);
    const forged = await fetch(body.url.replace(/s=[^&]+/, "s=AAAA"));
    assert(forged.status === 403, `falsifié : statut ${forged.status}`);
    return "PDF servi, falsification 403";
  });
  await check("Options du bouton (modèles) avec CORS", async () => {
    const res = await fetch(`${APP}/api/print-link`, { headers: bearer({ Origin: "https://extensions.shopifycdn.com" }) });
    const body = (await res.json()) as { templates?: { name: string }[] };
    assert(res.status === 200 && body.templates?.some((t) => t.name === "Bijoux"), `statut ${res.status}`);
  });
  await check("Caisse : PDF du panier", async () => {
    const res = await fetch(`${APP}/print/pos?l=11:2,21:1`, { headers: bearer() });
    assert(res.status === 200 && res.headers.get("content-type") === "application/pdf", `statut ${res.status} ${(await res.text()).slice(0, 200)}`);
  });
  await check("Caisse : demande illisible refusée", async () => {
    const res = await fetch(`${APP}/print/pos?l=abc`, { headers: bearer() });
    assert(res.status === 400, `statut ${res.status}`);
  });

  console.log("Réception, codes-barres");
  const scan = (code: string, key = randomUUID()) =>
    fetch(`${APP}/app/receive/scan`, { method: "POST", headers: bearer(), body: new URLSearchParams({ intent: "scan", code, locationId: "gid://shopify/Location/1", key }) });
  await check("Scan d'un code connu : +1 en stock", async () => {
    const body = (await (await scan("2000000000015")).json()) as { ok: boolean; stock?: number; error?: string };
    assert(body.ok && body.stock === 4, JSON.stringify(body));
    return "stock 3 → 4";
  });
  await check("Scan d'un code inconnu : message", async () => {
    const body = (await (await scan("999")).json()) as { ok: boolean; error?: string };
    assert(!body.ok && body.error, JSON.stringify(body));
    return body.error!;
  });
  await check("Création des codes manquants (301 variantes sans code)", async () => {
    const res = await fetch(`${APP}/app/barcodes.data`, { method: "POST", headers: bearer(), body: new URLSearchParams({ intent: "generate-missing" }) });
    assert(res.status === 200, `statut ${res.status}`);
    const { barcodes } = await mock("/__mock/state");
    const missing = Object.values(barcodes).filter((b) => !b).length;
    const codes = Object.values(barcodes);
    assert(!missing, `${missing} variantes toujours sans code`);
    assert(new Set(codes).size === codes.length, "codes en double");
    return `${codes.length} variantes, toutes uniques`;
  });

  console.log("Navigateur (Chromium) : bureau et téléphone");
  await browserChecks(template.id);

  console.log("Webhooks");
  const webhook = (topic: string, body: object, secret = SECRET) => {
    const raw = JSON.stringify(body);
    return fetch(`${APP}/webhooks/compliance`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", "X-Shopify-Topic": topic, "X-Shopify-Shop-Domain": SHOP, "X-Shopify-API-Version": "2026-10",
        "X-Shopify-Webhook-Id": randomUUID(), "X-Shopify-Event-Id": randomUUID(), "X-Shopify-Triggered-At": new Date().toISOString(),
        "X-Shopify-Hmac-Sha256": createHmac("sha256", secret).update(raw).digest("base64"),
      },
      body: raw,
    });
  };
  await check("Webhook avec une mauvaise signature refusé", async () => {
    const res = await webhook("shop/redact", { shop_domain: SHOP }, "faux");
    assert(res.status === 401, `statut ${res.status}`);
  });
  await check("customers/data_request accepté", async () => {
    const res = await webhook("customers/data_request", { shop_domain: SHOP, customer: { id: 1 } });
    assert(res.status === 200, `statut ${res.status}`);
  });
  await check("shop/redact efface toutes les données de la boutique", async () => {
    const before = await db.printedPrice.count({ where: { shop: SHOP } });
    assert(before > 0, "aucun prix imprimé enregistré avant l'effacement");
    const res = await webhook("shop/redact", { shop_domain: SHOP });
    assert(res.status === 200, `statut ${res.status}`);
    const left = { jobs: await db.printJob.count(), templates: await db.labelTemplate.count(), prices: await db.printedPrice.count(), sessions: await db.session.count(), changes: await db.barcodeChange.count() };
    assert(Object.values(left).every((n) => n === 0), JSON.stringify(left));
    return `${before} prix imprimés effacés, comme le reste`;
  });
  await db.$disconnect();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} réussis, ${failed.length} échoués`);
  if (failed.length) console.log(appLog.split("\n").slice(-40).join("\n"));
  writeFileSync(join(ROOT, "simulation", "e2e-results.json"), JSON.stringify(results, null, 2));
  return failed.length ? 1 : 0;
}

// App Bridge et Polaris viennent de cdn.shopify.com, inaccessible ici : on les
// remplace. App Bridge factice = jeton de session + fetch authentifié, comme le vrai.
// Sans Polaris, les composants s-* s'affichent sans mise en forme : l'essai vérifie
// le comportement (hydratation, clics, envoi), pas l'apparence Polaris.
const APP_BRIDGE_STUB = `
  window.shopify = {
    idToken: () => window.e2eToken(),
    toast: { show: (m) => console.log("toast", m) },
    resourcePicker: async () => [{ id: "gid://shopify/Product/2", variants: [{ id: "gid://shopify/ProductVariant/21" }] }],
    config: { apiKey: "${KEY}", shop: "${SHOP}" },
  };
  const original = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    if (url.origin !== location.origin) return original(input, init);
    const headers = new Headers(init.headers || (typeof input === "string" ? undefined : input.headers));
    headers.set("Authorization", "Bearer " + (await window.e2eToken()));
    return original(input, { ...init, headers });
  };`;

async function browserChecks(templateId: string) {
  let chromium;
  try {
    chromium = createRequire("/opt/node-tools/node_modules/")("playwright").chromium;
  } catch {
    results.push({ name: "Navigateur", ok: false, detail: "Playwright absent : essais navigateur non exécutés" });
    return;
  }
  const browser = await chromium.launch();
  const shots = join(ROOT, "simulation");
  for (const device of [{ name: "bureau", width: 1280, height: 900 }, { name: "téléphone", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: device.width, height: device.height }, userAgent: UA });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e: Error) => errors.push(e.message));
    page.on("console", (m: { type(): string; text(): string }) => m.type() === "error" && !m.text().includes("cdn.shopify") && errors.push(m.text()));
    await page.exposeFunction("e2eToken", () => sessionToken());
    await page.route("https://cdn.shopify.com/**", (route: { request(): { url(): string }; fulfill(o: object): void }) =>
      route.fulfill({ contentType: "text/javascript", body: route.request().url().includes("app-bridge") ? APP_BRIDGE_STUB : "" }),
    );

    await check(`${device.name} : file d'impression, quantités puis impression PDF`, async () => {
      await page.goto(embedded(`/app/print?ids=${encodeURIComponent("gid://shopify/Product/1")}`), { waitUntil: "networkidle" });
      await page.getByText("Bague Lune").first().waitFor();
      await page.locator("s-button", { hasText: "Tout à 1" }).click();
      // Sans Polaris, le titre de section reste un attribut
      await page.locator('s-section[heading="2 étiquettes"]').waitFor({ state: "attached", timeout: 5000 });
      await page.locator("s-button", { hasText: "Ajouter des produits" }).click();
      await page.getByText("T-shirt coton bio").first().waitFor({ timeout: 10000 });
      await page.locator("s-button", { hasText: /^Imprimer$/ }).click();
      await page.getByText("étiquettes envoyées à l'impression").first().waitFor({ timeout: 20000 });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      await page.screenshot({ path: join(shots, `e2e-impression-${device.width}.png`), fullPage: true });
      assert(!errors.length, `erreurs JS : ${errors.join(" | ")}`);
      return `débordement horizontal ${overflow} px`;
    });

    await check(`${device.name} : éditeur de modèle à la largeur de l'écran, suppression confirmée`, async () => {
      await page.goto(embedded(`/app/templates/${templateId}`), { waitUntil: "networkidle" });
      await page.getByText("[custom.matiere]").first().waitFor();
      const box = await page.getByText("[custom.matiere]").first().evaluate((el: Element) => el.parentElement!.getBoundingClientRect().right);
      assert(box <= device.width, `l'étiquette dépasse l'écran (${Math.round(box)} px > ${device.width})`);
      await page.locator("s-button", { hasText: /^Supprimer$/ }).click();
      await page.getByText("Supprimer définitivement").first().waitFor();
      await page.locator("s-button", { hasText: "Annuler" }).click();
      assert(!(await page.getByText("Supprimer définitivement").count()), "la confirmation reste affichée");
      await page.screenshot({ path: join(shots, `e2e-editeur-${device.width}.png`), fullPage: true });
      assert(!errors.length, `erreurs JS : ${errors.join(" | ")}`);
      return `étiquette jusqu'à ${Math.round(box)} px`;
    });
    await context.close();
  }
  await browser.close();
}

main()
  .then((code) => (process.exitCode = code))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  // Arrête aussi les petits-enfants (npx lance un second processus)
  .finally(() => children.forEach((c) => c.pid && process.kill(-c.pid, "SIGTERM")));
