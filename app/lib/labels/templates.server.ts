import prisma from "../../db.server";
import { defaultLayout } from "./defaultLayouts";
import { customFormat, FORMATS, getFormat, type LabelFormat } from "./formats";
import type { LabelTemplateLayout } from "./template";
import { validateLayout } from "./validateLayout";

export interface ResolvedTemplate {
  id: string;
  name: string;
  format: LabelFormat;
  layout: LabelTemplateLayout;
  collectionIds: string[];
  builtin: boolean;
}

export const builtinId = (formatId: string) => `builtin:${formatId}`;

function builtin(format: LabelFormat): ResolvedTemplate {
  return { id: builtinId(format.id), name: format.name, format, layout: defaultLayout(format), collectionIds: [], builtin: true };
}

function fromRow(row: { id: string; name: string; formatId: string; widthMm: number; heightMm: number; shape: string; layoutJson: string; collectionIds: string }): ResolvedTemplate {
  const known = getFormat(row.formatId);
  // Dimensions stockées : une mise à jour de la bibliothèque ne change jamais un modèle existant
  const format: LabelFormat =
    known?.kind === "sheet" ? known : { ...customFormat(row.widthMm, row.heightMm, row.shape === "round" ? "round" : "rect"), id: row.formatId, name: known?.name ?? "Taille libre" };
  return {
    id: row.id,
    name: row.name,
    format,
    layout: validateLayout(JSON.parse(row.layoutJson), format.widthMm, format.heightMm),
    collectionIds: row.collectionIds.split(",").filter(Boolean),
    builtin: false,
  };
}

export async function listTemplates(shop: string): Promise<ResolvedTemplate[]> {
  const rows = await prisma.labelTemplate.findMany({ where: { shop }, orderBy: { updatedAt: "desc" } });
  return [...rows.map(fromRow), ...FORMATS.map(builtin)];
}

export async function resolveTemplate(shop: string, id: string): Promise<ResolvedTemplate> {
  if (id.startsWith("builtin:")) {
    const format = getFormat(id.slice("builtin:".length));
    if (format) return builtin(format);
  } else {
    const row = await prisma.labelTemplate.findFirst({ where: { shop, id } });
    if (row) return fromRow(row);
  }
  throw new Response("Modèle introuvable", { status: 404 });
}
