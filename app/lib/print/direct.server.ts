import type { ResolvedTemplate } from "../labels/templates.server";
import { dymoLabelXml, dymoPrintParams, pageToPng } from "./dymo.server";
import { PrintJobError } from "./job";
import { rasterizePdf } from "./raster.server";
import type { PrintGroup } from "./render.server";
import { groupIdentical, pagesToZpl } from "./zpl";

export type DirectOutput = "zpl" | "dymo";

export interface DirectGroup {
  templateName: string;
  labelCount: number;
  warnings: string[];
  zpl?: string;
  dymo?: { labelXml: string; printParamsXml: string }[];
}

const asDpi = (dpi: number): 203 | 300 | 600 => (dpi === 300 || dpi === 600 ? dpi : 203);

// Transforme les PDF prêts en données pour l'imprimante (F17)
export async function toDirect(
  groups: PrintGroup[],
  templates: ResolvedTemplate[],
  output: DirectOutput,
  printerDpi: number,
): Promise<DirectGroup[]> {
  const byId = new Map(templates.map((t) => [t.id, t]));
  const out: DirectGroup[] = [];
  for (const group of groups) {
    const format = byId.get(group.templateId)?.format;
    if (!format || format.kind !== "roll") {
      throw new PrintJobError(`« ${group.templateName} » est une planche A4/Lettre : imprimez-la en PDF.`);
    }
    const base = { templateName: group.templateName, labelCount: group.labelCount, warnings: group.warnings };
    if (output === "zpl") {
      out.push({ ...base, zpl: pagesToZpl(await rasterizePdf(group.pdf, asDpi(printerDpi))) });
    } else {
      // Les LabelWriter impriment à 300 ppp
      const pages = groupIdentical(await rasterizePdf(group.pdf, 300));
      out.push({
        ...base,
        dymo: pages.map(({ page, copies }) => ({ labelXml: dymoLabelXml(format, pageToPng(page)), printParamsXml: dymoPrintParams(copies) })),
      });
    }
  }
  return out;
}
