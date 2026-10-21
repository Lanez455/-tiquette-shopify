import { PNG } from "pngjs";
import type { LabelFormat } from "../labels/formats";
import type { RasterPage } from "./raster.server";

// Impression directe sur Dymo (F17) via DYMO Connect : l'étiquette tramée à
// 300 ppp (la résolution des LabelWriter) part en image dans un fichier
// d'étiquette Dymo. Comme pour Zebra, le rendu est celui du PDF.

const TWIPS_PER_MM = 1440 / 25.4;

// Noms des rouleaux dans DYMO Connect. À confirmer sur une vraie Dymo :
// un nom inconnu fait refuser l'impression, l'app repasse alors au PDF.
export const DYMO_PAPER: Record<string, string> = {
  "dymo-30252": "30252 Address",
  "dymo-30336": "30336 1 in x 2-1/8 in",
  "dymo-30332": "30332 1 in x 1 in",
  "dymo-30334": "30334 2-1/4 in x 1-1/4 in",
  "dymo-30333": "30333 1/2 in x 1 in",
  "dymo-30299": "30299 Jewelry",
};

export function pageToPng(page: RasterPage): Buffer {
  const png = new PNG({ width: page.width, height: page.height, colorType: 0, inputColorType: 0, bitDepth: 8 });
  for (let i = 0; i < page.dots.length; i++) {
    const v = page.dots[i]!;
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(png, { colorType: 0 });
}

const xmlEscape = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function dymoLabelXml(format: LabelFormat, png: Buffer): string {
  if (format.kind !== "roll") throw new Error("Les Dymo impriment sur rouleau");
  // Les Dymo avancent par le petit côté : le rouleau est décrit en portrait,
  // et une étiquette plus large que haute s'imprime en paysage.
  const shortTw = Math.round(Math.min(format.widthMm, format.heightMm) * TWIPS_PER_MM);
  const longTw = Math.round(Math.max(format.widthMm, format.heightMm) * TWIPS_PER_MM);
  const landscape = format.widthMm >= format.heightMm;
  const paper = DYMO_PAPER[format.id] ?? "";
  return `<?xml version="1.0" encoding="utf-8"?>
<DieCutLabel Version="8.0" Units="twips">
  <PaperOrientation>${landscape ? "Landscape" : "Portrait"}</PaperOrientation>
  <Id>Etiquette</Id>
  <PaperName>${xmlEscape(paper)}</PaperName>
  <DrawCommands>
    <RoundRectangle X="0" Y="0" Width="${shortTw}" Height="${longTw}" Rx="0" Ry="0" />
  </DrawCommands>
  <ObjectInfo>
    <ImageObject>
      <Name>ETIQUETTE</Name>
      <ForeColor Alpha="255" Red="0" Green="0" Blue="0" />
      <BackColor Alpha="0" Red="255" Green="255" Blue="255" />
      <LinkedObjectName></LinkedObjectName>
      <Rotation>Rotation0</Rotation>
      <IsMirrored>False</IsMirrored>
      <IsVariable>False</IsVariable>
      <Image>${png.toString("base64")}</Image>
      <ScaleMode>Fill</ScaleMode>
      <BorderWidth>0</BorderWidth>
      <BorderColor Alpha="255" Red="0" Green="0" Blue="0" />
      <HorizontalAlignment>Center</HorizontalAlignment>
      <VerticalAlignment>Center</VerticalAlignment>
    </ImageObject>
    <Bounds X="0" Y="0" Width="${landscape ? longTw : shortTw}" Height="${landscape ? shortTw : longTw}" />
  </ObjectInfo>
</DieCutLabel>`;
}

export const dymoPrintParams = (copies: number) =>
  `<LabelWriterPrintParams><Copies>${Math.max(1, Math.floor(copies))}</Copies></LabelWriterPrintParams>`;
