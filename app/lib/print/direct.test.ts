import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import { buildInternalCode } from "~/lib/barcode/generate";
import { defaultLayout } from "~/lib/labels/defaultLayouts";
import { getFormat } from "~/lib/labels/formats";
import { renderLabels } from "~/lib/labels/pdf.server";
import type { ResolvedTemplate } from "~/lib/labels/templates.server";
import { scanPrinted } from "~/testing/printSimulator";
import { decodeZpl } from "~/testing/zplDecoder";
import { toDirect } from "./direct.server";
import { PrintJobError } from "./job";
import type { PrintGroup } from "./render.server";

const template = (id: string, formatId: string): ResolvedTemplate => {
  const format = getFormat(formatId)!;
  return { id, name: id, format, layout: defaultLayout(format), collectionIds: [], builtin: false };
};
const templates = [template("zebra", "zebra-2x1"), template("dymo", "dymo-30252"), template("a4", "avery-5160")];
const item = (n: number) => ({ title: "Pull laine", price: "49.00", barcode: buildInternalCode("ean13", n) });

async function group(templateId: string, items: ReturnType<typeof item>[], dpi = 203): Promise<PrintGroup> {
  const t = templates.find((x) => x.id === templateId)!;
  const { pdf } = await renderLabels({ format: t.format, layout: t.layout, items, printerDpi: dpi, price: { currency: "EUR", locale: "fr-FR" } });
  return { templateId, templateName: t.name, labelCount: items.length, pdf, warnings: [] };
}

describe("impression directe (F17)", () => {
  it("Zebra : ZPL à la résolution réglée, lisible au scan", async () => {
    const [out] = await toDirect([await group("zebra", [item(1), item(1)], 300)], templates, "zpl", 300);
    const labels = decodeZpl(out!.zpl!, 300);
    expect(labels).toHaveLength(1);
    expect(labels[0]!.copies).toBe(2);
    expect(labels[0]!.page.width).toBe(600); // 2 pouces à 300 ppp
    expect(scanPrinted(labels[0]!.page)).toBe(item(1).barcode);
  });

  it("Dymo : un fichier d'étiquette par article, image 300 ppp lisible, nombre d'exemplaires", async () => {
    const [out] = await toDirect([await group("dymo", [item(1), item(2), item(2)], 300)], templates, "dymo", 203);
    expect(out!.dymo).toHaveLength(2);
    expect(out!.dymo![1]!.printParamsXml).toContain("<Copies>2</Copies>");
    const xml = out!.dymo![0]!.labelXml;
    expect(xml).toContain("<PaperName>30252 Address</PaperName>");
    expect(xml).toContain("<PaperOrientation>Landscape</PaperOrientation>");
    const png = PNG.sync.read(Buffer.from(/<Image>([^<]+)<\/Image>/.exec(xml)![1]!, "base64"));
    const dots = new Uint8ClampedArray(png.width * png.height);
    for (let i = 0; i < dots.length; i++) dots[i] = png.data[i * 4]!;
    expect(scanPrinted({ dpi: 300, width: png.width, height: png.height, dots })).toBe(item(1).barcode);
  });

  it("refuse une planche A4 en impression directe", async () => {
    await expect(toDirect([await group("a4", [item(1)], 600)], templates, "zpl", 203)).rejects.toThrow(PrintJobError);
  });
});
