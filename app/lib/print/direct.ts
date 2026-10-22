// Côté navigateur : envoi direct aux logiciels d'imprimante installés sur
// l'ordinateur (F17). Sans eux (iPad, logiciel absent), l'app repasse au PDF.

export interface DirectGroup {
  templateName: string;
  labelCount: number;
  warnings: string[];
  zpl?: string;
  dymo?: { labelXml: string; printParamsXml: string }[];
}

const TIMEOUT_MS = 4000;

async function call(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    if (!response.ok) throw new Error(`${response.status}`);
    return response;
  } finally {
    clearTimeout(timer);
  }
}

// Zebra Browser Print : service local sur le port 9101 (https)
const ZEBRA = "https://127.0.0.1:9101";

export async function printZebra(zpl: string): Promise<void> {
  const device = await (await call(`${ZEBRA}/default?type=printer`)).json();
  if (!device || !device.uid) throw new Error("Aucune imprimante Zebra par défaut dans Browser Print");
  // text/plain : évite la requête préalable que Browser Print refuse
  await call(`${ZEBRA}/write`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ device, data: zpl }) });
}

// DYMO Connect : service local sur le port 41951
const DYMO = "https://127.0.0.1:41951/DYMO/DLS/Printing";

export function firstDymoPrinter(xml: string): string | null {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  for (const printer of Array.from(doc.getElementsByTagName("LabelWriterPrinter"))) {
    const name = printer.getElementsByTagName("Name")[0]?.textContent;
    const connected = printer.getElementsByTagName("IsConnected")[0]?.textContent;
    if (name && connected !== "False") return name;
  }
  return null;
}

export async function printDymo(labels: { labelXml: string; printParamsXml: string }[]): Promise<void> {
  const printers = await (await call(`${DYMO}/GetPrinters`)).text();
  const printerName = firstDymoPrinter(printers);
  if (!printerName) throw new Error("Aucune Dymo LabelWriter branchée");
  for (const label of labels) {
    const body = new URLSearchParams({ printerName, printParamsXml: label.printParamsXml, labelXml: label.labelXml, labelSetXml: "" });
    await call(`${DYMO}/PrintLabel`, { method: "POST", body });
  }
}

export async function sendDirect(groups: DirectGroup[]): Promise<void> {
  for (const group of groups) {
    if (group.zpl) await printZebra(group.zpl);
    else if (group.dymo) await printDymo(group.dymo);
  }
}
