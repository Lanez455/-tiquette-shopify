export const t = (key: string, vars?: Record<string, string | number>) => String(shopify.i18n.translate(key, vars));

// Adresse relative : la caisse la complète avec l'adresse de l'app et y
// joint son jeton de session. La langue de la caisse suit, pour les messages d'erreur.
export function labelsPath(lines: { variantId: number; quantity: number }[], locale = "fr"): string {
  const l = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.variantId}:${Math.min(line.quantity, 1000)}`)
    .join(",");
  return `/print/pos?l=${encodeURIComponent(l)}&locale=${locale}`;
}

export async function printLabels(lines: { variantId: number; quantity: number }[]): Promise<boolean> {
  if (!lines.some((line) => line.quantity > 0)) {
    shopify.toast.show(t("nothing"));
    return false;
  }
  try {
    await shopify.printing.print(labelsPath(lines, t("lang")));
    return true;
  } catch {
    shopify.toast.show(t("failed"));
    return false;
  }
}
