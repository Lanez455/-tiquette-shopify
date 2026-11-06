# Projet : app Shopify d'étiquettes code-barres

## Contexte
- Source de vérité : docs/SPEC.md (fonctions F1 à F22, toutes dans la version finale).
- Je débute en développement : explique chaque étape simplement, donne les commandes exactes à lancer.
- Réponds en français.

## Stack
- Modèle d'app officiel généré par la CLI Shopify, interface Polaris, intégrée à l'administration.
- API GraphQL Admin version 2026-10 minimum (lecture des bons de commande).
- Scopes : read_products, write_products, read_inventory, write_inventory, read_locations, read_inventory_purchase_orders, read_inventory_transfers, read_locales.
- Base de données : celle du modèle en développement, PostgreSQL en production.
- Impression : PDF à la taille exacte de l'étiquette par défaut ; impression directe sur ordinateur via Zebra Browser Print (ZPL) et DYMO Connect, repli sur le PDF (toujours le PDF sur iPad). Codes-barres : bibliothèque éprouvée (Code 128, EAN-13, UPC-A).
- Extensions : impression dans la fiche et la liste produits de l'administration, tuile dans l'app de caisse.
- Webhooks RGPD obligatoires pour une app publique (customers/data_request, customers/redact, shop/redact).

## Règles absolues
1. Codes-barres : ne jamais les dériver de l'identifiant de variante. Vérifier l'unicité dans tout le catalogue avant d'écrire. Ne jamais modifier un code existant sans confirmation explicite du marchand. Journaliser chaque changement. Ne jamais inventer de GTIN. Tests automatiques obligatoires sur cette partie.
2. Mises à jour : ne jamais changer le comportement existant pour les marchands déjà installés. Pas de changement de quantité par défaut, de police, de taille ou de mise en page d'un modèle existant. Toute nouveauté qui modifie un comportement est une option désactivée par défaut. Les migrations de données sont réversibles et testées sur une copie.
3. Non-régression : un test compare le PDF de chaque format prêt avant et après chaque modification. Un écart bloque la version.
4. Ne rien inventer : si une API Shopify ne permet pas une fonction, dis-le et propose une alternative.
5. Une tâche n'est terminée que si ses tests passent et que son critère de validation (docs/SPEC.md) est rempli.
6. Demande-moi avant : supprimer des fichiers ou des données, ajouter un scope (les marchands devront réapprouver l'app), ajouter une dépendance lourde, déployer en production.

## Organisation
- ROADMAP.md : toutes les fonctions en cases à cocher.
- CHANGELOG.md : une entrée par version (numérotation X.Y.Z).
- docs/aide/ : une fiche par imprimante avec les bons réglages.
- Git : une branche par fonction, commits clairs, un tag vX.Y.Z à chaque version publiée.

## Calendrier des versions
- v1.0.0 (version finale) : F1 à F22, formules Gratuit, Pro et Magasin via l'API de facturation de Shopify. Soumission à la revue Shopify.
- Ensuite, une version toutes les 2 semaines : corrections et améliorations issues de RETOURS.md.
- Entre deux versions : correctifs X.Y.Z pour les bugs bloquants, publiés dès qu'ils sont prêts.

## Vérification à chaque étape (demandé par Yanis)
- Avant chaque commit : `npm run verify` (types, tests, build). Rien n'est poussé si une étape échoue.
- Toute modification du rendu : générer un PDF d'exemple, le convertir en image et le regarder avant de valider.
- Tout code-barres produit doit passer le test de lecture (app/lib/labels/scan.test.ts).
- Relire le diff complet avant de pousser, et signaler ce qui n'a pas pu être vérifié (imprimante réelle, boutique de développement).

## Procédure pour chaque version
1. Lire RETOURS.md, ROADMAP.md et CHANGELOG.md.
2. Classer les retours : bug bloquant, bug, demande de fonction. Proposer le contenu de la version (bugs bloquants d'abord, puis les demandes les plus fréquentes) et attendre mon accord.
3. Développer avec les tests, y compris la non-régression des PDF.
4. Mettre à jour CHANGELOG.md, l'écran « Nouveautés » de l'app et les fiches d'aide concernées.
5. Liste de contrôle avant déploiement : tests verts, migration testée sur une copie, déploiement des extensions, déploiement du serveur, tag Git.
6. Me donner : ce que je dois tester à la main sur la boutique de développement et sur mes imprimantes, et un court texte pour annoncer la version aux marchands.
