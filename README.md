# Étiquettes code-barres pour Shopify

App Shopify d'étiquettes code-barres pour les boutiques physiques. Le cahier des charges complet est dans [docs/SPEC.md](docs/SPEC.md), les règles de travail dans [CLAUDE.md](CLAUDE.md) et l'avancement dans [ROADMAP.md](ROADMAP.md).

## Démarrer

Il faut Node.js 20.19 ou plus récent, un compte Partenaire Shopify et une boutique de développement.

```bash
npm install
npm run verify        # types, lint, tests, build
npm run e2e           # après le build : l'app de production face à un faux Shopify (voir plus bas)
npx shopify app config link   # relie le projet à ton app Shopify (une seule fois)
npm run dev           # lance l'app sur la boutique de développement
```

## Mise en ligne

Le guide pas à pas est dans [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md) (Fly.io, base SQLite sur un volume).

## Essai de bout en bout

`npm run e2e` lance l'app compilée comme en production, face à un faux Shopify en HTTPS (`scripts/e2e/mockAdmin.ts`) : vrais jetons de session signés, échange de jeton, API GraphQL avec la limite de coût de 1 000 points, refus THROTTLED, webhooks signés HMAC, puis Chromium en largeur bureau et téléphone. Prérequis : `127.0.0.1 e2e-test.myshopify.com` dans `/etc/hosts`, le port 443 libre, `pdftotext` et Playwright. App Bridge et Polaris (cdn.shopify.com) y sont remplacés : l'apparence Polaris ne se vérifie que dans une vraie boutique.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `app/lib/barcode` | Génération et protection des codes-barres (F10, F11) |
| `app/lib/labels` | Formats, mise en page, prix et rendu PDF (F1 à F4, F7 à F9) |
| `app/routes` | Écrans de l'app et webhooks |
| `app/lib/print` | Impression : quantités, modèle par collection, liens signés |
| `extensions/print-labels-admin` | Bouton « Imprimer » de la fiche produit et de la liste des produits |
| `extensions/print-labels-pos` | Tuile de caisse (panier) et menu de la fiche produit en caisse |
| `prisma` | Base de données : modèles, réglages, historique, journal des codes |
| `docs` | Cahier des charges |
| `scripts/e2e` | Essai de bout en bout (faux Shopify et scénario) |
