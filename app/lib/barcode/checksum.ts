// Clé de contrôle GS1 (modulo 10), commune à EAN-8, UPC-A, EAN-13 et GTIN-14.

export function gtinCheckDigit(body: string): number {
  if (!/^\d+$/.test(body)) throw new Error(`Corps de GTIN non numérique : ${body}`);
  let sum = 0;
  // Depuis la droite : poids 3, 1, 3, 1…
  for (let i = 0; i < body.length; i++) {
    const digit = Number(body[body.length - 1 - i]);
    sum += digit * (i % 2 === 0 ? 3 : 1);
  }
  return (10 - (sum % 10)) % 10;
}

export function withCheckDigit(body: string): string {
  return body + String(gtinCheckDigit(body));
}

export function isValidGtin(code: string): boolean {
  if (!/^\d+$/.test(code) || ![8, 12, 13, 14].includes(code.length)) return false;
  return gtinCheckDigit(code.slice(0, -1)) === Number(code.at(-1));
}

// Forme de comparaison : un UPC-A et l'EAN-13 « 0 + UPC » sont le même code au scan.
export function normalizeBarcode(code: string): string {
  const trimmed = code.trim();
  if (/^\d+$/.test(trimmed) && [8, 12, 13, 14].includes(trimmed.length)) {
    return trimmed.padStart(14, "0");
  }
  return trimmed.toUpperCase();
}
