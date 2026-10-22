import prisma from "../db.server";

// Contrôle de santé pour l'hébergeur : le serveur répond et la base est lisible
export const loader = async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return new Response("ok", { headers: { "Cache-Control": "no-store" } });
  } catch {
    return new Response("base indisponible", { status: 503 });
  }
};
