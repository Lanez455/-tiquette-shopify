import type { RasterPage } from "~/lib/print/raster.server";

// Décodeur ZPL minimal pour les tests : relit ce que la Zebra imprimerait
// (^PW, ^LL, ^FO0,0^GFA compressé, ^PQ) et rend les points.
export function decodeZpl(zpl: string, dpi: number): { page: RasterPage; copies: number }[] {
  const labels = zpl.split("^XZ").filter((l) => l.includes("^XA"));
  return labels.map((label) => {
    const width = Number(/\^PW(\d+)/.exec(label)![1]);
    const height = Number(/\^LL(\d+)/.exec(label)![1]);
    const gfa = /\^GFA,(\d+),(\d+),(\d+),([^^]*)\^FS/.exec(label)!;
    const total = Number(gfa[1]);
    const bytesPerRow = Number(gfa[3]);
    const copies = Number(/\^PQ(\d+)/.exec(label)?.[1] ?? 1);
    const rows: string[] = [];
    const data = gfa[4]!.replace(/\s/g, "");
    let row = "";
    let count = 0;
    const rowHex = bytesPerRow * 2;
    const endRow = (fill: string) => {
      rows.push((row + fill.repeat(rowHex)).slice(0, rowHex));
      row = "";
    };
    for (const c of data) {
      if (c >= "G" && c <= "Y") count += c.charCodeAt(0) - 70;
      else if (c >= "g" && c <= "z") count += (c.charCodeAt(0) - 102) * 20;
      else if (c === ",") endRow("0");
      else if (c === "!") endRow("F");
      else if (c === ":") rows.push(rows[rows.length - 1]!);
      else {
        row += c.repeat(count || 1);
        count = 0;
        if (row.length >= rowHex) endRow("");
      }
    }
    if (rows.length * bytesPerRow !== total) throw new Error(`ZPL : ${rows.length * bytesPerRow} octets au lieu de ${total}`);
    const dots = new Uint8ClampedArray(width * height).fill(255);
    rows.forEach((hex, y) => {
      for (let x = 0; x < width; x++) {
        const byte = parseInt(hex.substr(Math.floor(x / 8) * 2, 2), 16);
        if (byte & (0x80 >> x % 8)) dots[y * width + x] = 0;
      }
    });
    return { page: { dpi, width, height, dots }, copies };
  });
}
