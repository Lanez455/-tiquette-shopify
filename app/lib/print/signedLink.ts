import { createHmac, timingSafeEqual } from "node:crypto";

// Lien d'impression signé : l'admin Shopify (bouton Imprimer) et la caisse
// chargent le PDF par une simple URL, sans jeton de session garanti. Le lien
// porte donc sa propre preuve : une signature HMAC avec le secret de l'app, et
// une date d'expiration courte. Il ne contient que l'impression enregistrée
// (PrintJob), pour rester court même avec des centaines de variantes.

export interface PrintLinkPayload {
  shop: string;
  jobId: string;
  // Expiration, en millisecondes depuis 1970
  exp: number;
}

export const LINK_TTL_MS = 10 * 60 * 1000;

const b64url = (buf: Buffer) => buf.toString("base64url");

function sign(data: string, secret: string) {
  return createHmac("sha256", secret).update(data).digest();
}

export function createPrintLink(payload: Omit<PrintLinkPayload, "exp">, secret: string, now = Date.now()): string {
  if (!secret) throw new Error("Secret de l'app manquant");
  const data = b64url(Buffer.from(JSON.stringify({ ...payload, exp: now + LINK_TTL_MS })));
  return `d=${data}&s=${b64url(sign(data, secret))}`;
}

export class InvalidLinkError extends Error {}

export function verifyPrintLink(query: URLSearchParams, secret: string, now = Date.now()): PrintLinkPayload {
  const data = query.get("d") ?? "";
  const signature = Buffer.from(query.get("s") ?? "", "base64url");
  const expected = sign(data, secret);
  if (!secret || signature.length !== expected.length || !timingSafeEqual(signature, expected)) {
    throw new InvalidLinkError("Lien d'impression invalide");
  }
  const payload = JSON.parse(Buffer.from(data, "base64url").toString("utf8")) as PrintLinkPayload;
  if (typeof payload.shop !== "string" || typeof payload.jobId !== "string") throw new InvalidLinkError("Lien d'impression invalide");
  if (typeof payload.exp !== "number" || payload.exp < now) throw new InvalidLinkError("Lien d'impression expiré");
  return payload;
}
