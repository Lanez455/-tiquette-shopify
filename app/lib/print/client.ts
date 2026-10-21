// Côté navigateur : ouvre le PDF dans la fenêtre d'impression du système.
import type { DirectGroup } from "./direct";

export interface PrintResponse {
  groups?: { templateName: string; labelCount: number; warnings: string[]; pdfBase64: string }[];
  direct?: DirectGroup[];
  // Impression enregistrée, rejouée en PDF si l'imprimante ne répond pas
  jobId?: string;
  error?: string;
}

export function pdfUrl(base64: string): string {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes], { type: "application/pdf" }));
}

// Résout dès que la fenêtre d'impression est ouverte : avec plusieurs modèles,
// les PDF s'enchaînent sans attendre. Le cadre est retiré une minute plus tard.
export function printPdfUrl(url: string): Promise<void> {
  return new Promise((resolve) => {
    const frame = document.createElement("iframe");
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    frame.src = url;
    frame.onload = () => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } finally {
        resolve();
        // Laisse la fenêtre d'impression lire le document avant de le retirer
        setTimeout(() => {
          frame.remove();
          URL.revokeObjectURL(url);
        }, 60_000);
      }
    };
    document.body.appendChild(frame);
  });
}

// Ne lève jamais : une panne réseau ou une page d'erreur devient un message,
// sinon le bouton Imprimer resterait bloqué en attente
export async function requestPrint(body: unknown, fetchImpl: typeof fetch = fetch): Promise<PrintResponse> {
  let response: Response;
  try {
    response = await fetchImpl("/app/print/pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    return { error: "Connexion perdue : réessayez." };
  }
  try {
    return (await response.json()) as PrintResponse;
  } catch {
    return { error: `Erreur du serveur (${response.status}) : réessayez dans un instant.` };
  }
}
