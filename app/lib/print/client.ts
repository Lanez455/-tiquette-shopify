// Côté navigateur : ouvre le PDF dans la fenêtre d'impression du système.
export interface PrintResponse {
  groups?: { templateName: string; labelCount: number; warnings: string[]; pdfBase64: string }[];
  error?: string;
}

export function pdfUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

export function printPdfUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    frame.onload = () => {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
      // Laisse la fenêtre d'impression lire le document avant de le retirer
      setTimeout(() => {
        frame.remove();
        URL.revokeObjectURL(url);
        resolve();
      }, 60_000);
    };
    document.body.appendChild(frame);
  });
}

export async function requestPrint(body: unknown): Promise<PrintResponse> {
  const response = await fetch("/app/print/pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return (await response.json()) as PrintResponse;
}
