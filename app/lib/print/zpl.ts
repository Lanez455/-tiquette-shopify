import type { RasterPage } from "./raster.server";

// Impression directe sur Zebra (F17) : l'étiquette tramée part en image ZPL
// (^GFA). Le rendu est donc identique au PDF, police et caractères spéciaux
// compris, et les barres déjà calées sur les points de la tête restent nettes.

const HEX = "0123456789ABCDEF";

// Compression ASCII de Zebra : G…Y répètent 1 à 19 fois, g…z 20 à 400 fois,
// « , » remplit la ligne de blanc, « ! » de noir, « : » répète la ligne précédente.
function repeatCount(n: number): string {
  let out = "";
  while (n >= 400) { out += "z"; n -= 400; }
  if (n >= 20) { out += String.fromCharCode("g".charCodeAt(0) + Math.floor(n / 20) - 1); n %= 20; }
  if (n > 0) out += String.fromCharCode("G".charCodeAt(0) + n - 1);
  return out;
}

function compressRow(hex: string): string {
  let body = hex;
  let tail = "";
  const zeros = /0+$/.exec(body);
  if (zeros) { body = body.slice(0, zeros.index); tail = ","; }
  else {
    const ones = /F+$/.exec(body);
    if (ones && ones[0].length > 1) { body = body.slice(0, ones.index); tail = "!"; }
  }
  let out = "";
  for (let i = 0; i < body.length; ) {
    let j = i;
    while (j < body.length && body[j] === body[i]) j++;
    const run = j - i;
    out += (run > 1 ? repeatCount(run) : "") + body[i];
    i = j;
  }
  return out + tail;
}

export function zplGraphic(page: RasterPage): { bytesPerRow: number; totalBytes: number; data: string } {
  const bytesPerRow = Math.ceil(page.width / 8);
  const rows: string[] = [];
  let previous = "";
  for (let y = 0; y < page.height; y++) {
    let hex = "";
    for (let b = 0; b < bytesPerRow; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = b * 8 + bit;
        // 1 = point chauffé (noir)
        if (x < page.width && page.dots[y * page.width + x] === 0) byte |= 0x80 >> bit;
      }
      hex += HEX[byte >> 4]! + HEX[byte & 15]!;
    }
    rows.push(y > 0 && hex === previous ? ":" : compressRow(hex));
    previous = hex;
  }
  return { bytesPerRow, totalBytes: bytesPerRow * page.height, data: rows.join("") };
}

const samePage = (a: RasterPage, b: RasterPage) =>
  a.width === b.width && a.height === b.height && a.dots.every((v, i) => v === b.dots[i]);

// Étiquettes identiques à la suite (même variante × quantité) : une seule image
// et ^PQ pour le nombre d'exemplaires, au lieu de renvoyer l'image n fois.
export function groupIdentical(pages: RasterPage[]): { page: RasterPage; copies: number }[] {
  const groups: { page: RasterPage; copies: number }[] = [];
  for (const page of pages) {
    const last = groups[groups.length - 1];
    if (last && samePage(last.page, page)) last.copies++;
    else groups.push({ page, copies: 1 });
  }
  return groups;
}

export function pagesToZpl(pages: RasterPage[]): string {
  return groupIdentical(pages)
    .map(({ page, copies }) => {
      const g = zplGraphic(page);
      return [
        "^XA",
        "^CI28",
        `^PW${page.width}`,
        `^LL${page.height}`,
        "^LH0,0",
        `^FO0,0^GFA,${g.totalBytes},${g.totalBytes},${g.bytesPerRow},${g.data}^FS`,
        `^PQ${copies},0,1,Y`,
        "^XZ",
      ].join("\n");
    })
    .join("\n");
}
