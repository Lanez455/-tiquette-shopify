import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Derrière le proxy Fly, le serveur reçoit les requêtes en http : l'origine
  // https du navigateur ne correspond plus et React Router refuse les envois
  // de formulaires (400 « Bad Request »). On autorise l'adresse de l'app.
  allowedActionOrigins: ["etiqo-barcode-labels.fly.dev"],
} satisfies Config;
