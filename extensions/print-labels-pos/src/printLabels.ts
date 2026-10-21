// Adresse relative : la caisse la complète avec l'adresse de l'app et y
// joint son jeton de session.
export function labelsPath(lines: { variantId: number; quantity: number }[]): string {
  const l = lines
    .filter((line) => line.quantity > 0)
    .map((line) => `${line.variantId}:${Math.min(line.quantity, 1000)}`)
    .join(",");
  return `/print/pos?l=${encodeURIComponent(l)}`;
}

export async function printLabels(lines: { variantId: number; quantity: number }[]): Promise<boolean> {
  if (!lines.some((line) => line.quantity > 0)) {
    shopify.toast.show("Aucune étiquette à imprimer");
    return false;
  }
  try {
    await shopify.printing.print(labelsPath(lines));
    return true;
  } catch {
    shopify.toast.show("Impression impossible : vérifiez la connexion");
    return false;
  }
}
