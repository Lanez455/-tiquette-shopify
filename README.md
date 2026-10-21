# Étiquettes code-barres pour Shopify

App Shopify d'étiquettes code-barres pour les boutiques physiques. Le cahier des charges complet est dans [docs/SPEC.md](docs/SPEC.md), les règles de travail dans [CLAUDE.md](CLAUDE.md) et l'avancement dans [ROADMAP.md](ROADMAP.md).

## Démarrer

Il faut Node.js 20.19 ou plus récent, un compte Partenaire Shopify et une boutique de développement.

```bash
npm install
npm run verify        # types, tests, build
npx shopify app config link   # relie le projet à ton app Shopify (une seule fois)
npm run dev           # lance l'app sur la boutique de développement
```

## Organisation

| Dossier | Contenu |
| --- | --- |
| `app/lib/barcode` | Génération et protection des codes-barres (F10, F11) |
| `app/lib/labels` | Formats, mise en page, prix et rendu PDF (F1 à F4, F7 à F9) |
| `app/routes` | Écrans de l'app et webhooks |
| `prisma` | Base de données : modèles, réglages, historique, journal des codes |
| `docs` | Cahier des charges |
