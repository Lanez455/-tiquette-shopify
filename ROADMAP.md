# Feuille de route : v1.0.0 (version finale)

Critères de validation : voir docs/SPEC.md. Tout est écrit et testé (tests automatiques et simulateur d'impression). Reste l'essai sur une boutique de développement et sur de vraies imprimantes.

## Formats et imprimantes
- [x] F1 Taille libre
- [x] F2 Formats prêts
- [x] F3 Case de départ
- [x] F4 Réglages fins

## Mise en page
- [x] F5 Éditeur visuel
- [x] F6 Champs, prix barré, métachamps
- [x] F7 Texte qui rétrécit
- [x] F8 Prix selon la devise
- [x] F9 Caractères spéciaux

## Codes-barres
- [x] F10 Codes uniques
- [x] F11 Codes existants protégés
- [x] F12 Scan sur la bonne variante

## Flux d'impression
- [x] F13 Quantité par défaut et sélection
- [x] F14 Bons de commande, transferts, CSV (champs de l'API vérifiés sur la référence 2026-10)
- [x] F15 Extensions d'impression et tuile de caisse (à essayer sur une boutique de test : adresse relative de fetch dans l'admin, jeton de la caisse)
- [x] F16 File et historique

## Impression directe et réception
- [x] F17 Impression directe Zebra et Dymo (ZPL testé au décodage ; noms de rouleaux Dymo et service local à essayer sur machine réelle)
- [x] F18 Réception par scan (mutation vérifiée sur la référence : clé d'idempotence obligatoire depuis 2026-04)

## Codes GS1, modèles et promotions
- [x] F19 Import GS1
- [x] F20 Modèle automatique par collection
- [x] F21 Réétiquetage des promotions
- [x] F22 Étiquettes de rayon et QR codes

## Lancement
- [x] Formules Gratuit, Pro, Magasin (API de facturation ; à essayer sur une boutique de développement)
- [x] Test de non-régression des PDF (simulateur : impression, scan et marges de chaque format)
- [ ] Dossier de revue Shopify

## Version 1.1.0 (prête, à publier après l'acceptation Shopify)
- [x] Gratuit à 250 étiquettes par mois, bons de commande et transferts compris
- [x] Nouveaux prix, paiement à l'année, 14 jours d'essai
- [x] Demande d'avis App Store après la 3e impression

## Version 1.2.0 (prévue après la 1.1.0)
- [ ] Comptage d'inventaire par scan, dans la formule Magasin : compter un magasin entier ou par fournisseur, type ou tag ; scan au téléphone, à la douchette ou à la caméra ; écarts avec photos à valider avant de mettre à jour le stock Shopify ; ventes faites pendant le comptage prises en compte. Concurrence relevée le 25/10/2026 : BR Stock Take (3,5 ★, 30 avis, 14,99 $ et 24,99 $), CountKit (sorti en octobre 2026, 3,99 $ et 7,99 $).
