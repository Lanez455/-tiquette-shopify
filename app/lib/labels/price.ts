// Prix selon la devise et la langue de la boutique (F8).

export interface PriceOptions {
  currency: string;
  locale: string;
  // "auto" suit les usages de la langue ; sinon le marchand impose la position
  symbolPosition?: "auto" | "before" | "after";
  // Espace entre le montant et le symbole quand la position est imposée
  spaceBetween?: boolean;
}

export function formatPrice(amount: number | string, options: PriceOptions): string {
  const value = typeof amount === "string" ? Number(amount) : amount;
  if (!Number.isFinite(value)) throw new Error(`Prix invalide : ${amount}`);
  const formatter = new Intl.NumberFormat(options.locale, {
    style: "currency",
    currency: options.currency,
  });
  if (!options.symbolPosition || options.symbolPosition === "auto") {
    return formatter.format(value);
  }
  const parts = formatter.formatToParts(value);
  const symbol = parts.find((p) => p.type === "currency")?.value ?? options.currency;
  const number = parts
    .filter((p) => p.type !== "currency" && p.type !== "literal")
    .map((p) => p.value)
    .join("")
    .trim();
  const space = options.spaceBetween === false ? "" : " ";
  return options.symbolPosition === "before" ? `${symbol}${space}${number}` : `${number}${space}${symbol}`;
}
