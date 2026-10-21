import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { Form, useActionData, useLoaderData, useNavigation } from "react-router";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";
import { getSettings } from "../lib/settings.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return getSettings(session.shop);
};

const oneOf = <T extends string>(value: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;
const clampNumber = (value: FormDataEntryValue | null, min: number, max: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : 0;
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const data = {
    defaultQuantity: oneOf(form.get("defaultQuantity"), ["zero", "one", "stock"] as const, "zero"),
    printMethod: oneOf(form.get("printMethod"), ["pdf", "zebra", "dymo"] as const, "pdf"),
    printerDpi: Number(oneOf(form.get("printerDpi"), ["203", "300"] as const, "203")),
    barcodeSymbology: oneOf(form.get("barcodeSymbology"), ["ean13", "upca", "code128"] as const, "ean13"),
    currencySymbol: oneOf(form.get("currencySymbol"), ["auto", "before", "after"] as const, "auto"),
    offsetXmm: clampNumber(form.get("offsetXmm"), -10, 10),
    offsetYmm: clampNumber(form.get("offsetYmm"), -10, 10),
    rotate90: form.get("rotate90") === "on",
  };
  await prisma.shopSettings.upsert({ where: { shop: session.shop }, create: { shop: session.shop, ...data }, update: data });
  return { message: "Réglages enregistrés." };
};

export default function Settings() {
  const s = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const busy = useNavigation().state !== "idle";
  return (
    <s-page heading="Réglages">
      {result && <s-banner tone="success">{result.message}</s-banner>}
      <Form method="post">
        <s-section heading="Impression">
          <s-select name="printMethod" label="Mode d'impression" value={s.printMethod}>
            <s-option value="pdf">Fenêtre d'impression (toutes imprimantes)</s-option>
            <s-option value="zebra">Impression directe Zebra (Browser Print)</s-option>
            <s-option value="dymo">Impression directe Dymo (DYMO Connect)</s-option>
          </s-select>
          <s-select name="printerDpi" label="Résolution de l'imprimante thermique" value={String(s.printerDpi)}>
            <s-option value="203">203 ppp (la plupart des Zebra, Rollo, Brother)</s-option>
            <s-option value="300">300 ppp (Dymo LabelWriter, Zebra 300 ppp)</s-option>
          </s-select>
          <s-select name="defaultQuantity" label="Quantité proposée par défaut" value={s.defaultQuantity}>
            <s-option value="zero">0</s-option>
            <s-option value="one">1</s-option>
            <s-option value="stock">Stock disponible</s-option>
          </s-select>
        </s-section>

        <s-section heading="Réglages fins">
          <s-paragraph>Si l'impression est décalée, corrigez-la ici. Un nombre positif décale vers la droite ou vers le bas.</s-paragraph>
          <s-number-field name="offsetXmm" label="Décalage horizontal (mm)" step={0.5} min={-10} max={10} value={String(s.offsetXmm)}></s-number-field>
          <s-number-field name="offsetYmm" label="Décalage vertical (mm)" step={0.5} min={-10} max={10} value={String(s.offsetYmm)}></s-number-field>
          <s-checkbox name="rotate90" label="Tourner de 90°" checked={s.rotate90}></s-checkbox>
        </s-section>

        <s-section heading="Codes-barres et prix">
          <s-select name="barcodeSymbology" label="Type des codes créés" value={s.barcodeSymbology}>
            <s-option value="ean13">EAN-13</s-option>
            <s-option value="upca">UPC-A</s-option>
            <s-option value="code128">Code 128</s-option>
          </s-select>
          <s-select name="currencySymbol" label="Symbole monétaire" value={s.currencySymbol}>
            <s-option value="auto">Selon la langue de la boutique</s-option>
            <s-option value="before">Avant le prix</s-option>
            <s-option value="after">Après le prix</s-option>
          </s-select>
        </s-section>

        <s-section>
          <s-button type="submit" variant="primary" disabled={busy}>Enregistrer</s-button>
        </s-section>
      </Form>
    </s-page>
  );
}
