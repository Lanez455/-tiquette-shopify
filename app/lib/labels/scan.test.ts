import { describe, expect, it } from "vitest";
import { PNG } from "pngjs";
import {
  BarcodeFormat,
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { buildInternalCode } from "../barcode/generate";
import { barcodePng } from "./pdf";

// Décode l'image comme le ferait un scanner, pour vérifier que les codes produits se lisent.
function decode(png: Buffer): { text: string; format: BarcodeFormat } {
  const image = PNG.sync.read(png);
  const luminance = new Uint8ClampedArray(image.width * image.height);
  for (let i = 0; i < luminance.length; i++) {
    const a = image.data[i * 4 + 3]! / 255;
    // Fond transparent = papier blanc
    luminance[i] = Math.round(image.data[i * 4]! * a + 255 * (1 - a));
  }
  const reader = new MultiFormatReader();
  const hints = new Map([[DecodeHintType.TRY_HARDER, true]]);
  const source = new RGBLuminanceSource(luminance, image.width, image.height);
  const result = reader.decode(new BinaryBitmap(new HybridBinarizer(source)), hints);
  return { text: result.getText(), format: result.getBarcodeFormat() };
}

describe("les codes générés se scannent", () => {
  const cases: [string, BarcodeFormat][] = [
    [buildInternalCode("ean13", 1), BarcodeFormat.EAN_13],
    [buildInternalCode("upca", 1), BarcodeFormat.UPC_A],
    [buildInternalCode("code128", 1), BarcodeFormat.CODE_128],
    ["4006381333931", BarcodeFormat.EAN_13],
  ];

  for (const [code, format] of cases) {
    it(`${code} sur une zone de 50 × 9 mm et de 23 × 11 mm`, async () => {
      for (const [w, h] of [[50, 9], [23, 11]] as const) {
        const result = decode(await barcodePng(code, w, h, true));
        expect(result.format).toBe(format);
        expect(result.text).toBe(code);
      }
    });
  }
});
